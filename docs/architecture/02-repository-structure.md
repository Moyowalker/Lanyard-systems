# 02 — Repository Structure

## 1. Decision: Monorepo (pnpm workspaces + Nx)

**AD-01.** A single repository containing all apps and shared packages.

> ⚠️ **Updated by [ADR-001](#adr-001--use-turborepo-not-nx-as-the-monorepo-task-runner):**
> the monorepo decision stands, but the task runner is **Turborepo**, not Nx. Read §1
> for the monorepo rationale; treat Nx-specific mechanics below as illustrative.

**Why monorepo here:**

- The frontends and backend **share contracts** (DTOs, enums, validation schemas,
  OpenAPI-generated client). A monorepo lets a contract change and its consumers move
  in **one atomic commit/PR**.
- One CI graph; Nx's **affected** detection only builds/tests what changed.
- Enforced **module boundaries** (Nx tags) prevent the store app from importing admin
  code, or a UI package from importing server code — directly supports our "modular,
  security-first" principles.

**Why Nx over plain Turborepo:** Nx ships first-class generators for both **NestJS and
Next.js**, a dependency graph, and **module-boundary lint rules**. Turborepo is a fine
lighter alternative; Nx's boundary enforcement is worth the extra weight for a regulated
platform. (This is reversible — task pipelines are the only lock-in.)

**Package manager:** **pnpm** (fast, strict, disk-efficient, great workspace support).

---

## 2. Top-level layout

```
lanyard-systems/
├── apps/
│   ├── api/                # NestJS — Platform Engine (HTTP + worker modes)
│   ├── web-marketing/      # Next.js — System 1: Marketing site
│   ├── web-store/          # Next.js — System 2: Customer commerce
│   └── web-admin/          # Next.js — System 3: Staff operations
│
├── packages/
│   ├── contracts/          # Source-of-truth DTOs, enums, zod schemas, error codes
│   ├── api-client/         # Typed SDK generated from OpenAPI (used by all web apps)
│   ├── ui/                 # Shared React component library (design system)
│   ├── config/             # Shared eslint/tsconfig/tailwind/prettier presets
│   ├── utils/              # Framework-agnostic helpers (money, dates, validation)
│   └── observability/      # Logger, tracing, error-reporting wrappers
│
├── infra/
│   ├── docker/             # Dockerfiles, docker-compose.*.yml
│   ├── ci/                 # CI workflow fragments / scripts
│   └── env/                # .env.example files per app, schema docs (no secrets)
│
├── docs/
│   └── architecture/       # ← you are here
│
├── tools/                  # Repo scripts, generators, codemods
├── nx.json                 # Nx workspace config + task pipelines
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json      # Path aliases: @lanyard/contracts, @lanyard/ui, ...
└── .github/workflows/      # CI/CD pipelines
```

---

## 3. The `contracts` package — the keystone

This package is the **single source of truth** for the shape of the system.

```
packages/contracts/
├── src/
│   ├── enums/              # OrderStatus, Role, Permission, PaymentProvider, RxStatus…
│   ├── dto/                # Request/response DTOs per domain (catalog, orders, …)
│   ├── schemas/            # zod schemas (runtime validation, shared FE+BE)
│   ├── errors/             # Canonical error codes + messages
│   └── index.ts
```

- Backend imports these DTOs/enums; controllers validate against the zod schemas.
- Frontends import the **same** types and schemas → no drift between client and server.
- Changing an order status or a field is a single edit that the type-checker propagates
  to every consumer. This is the practical payoff of the monorepo.

> **Boundary rule:** `contracts` must have **zero** runtime dependencies on Nest/Next.
> It is pure TypeScript + zod so it can be imported anywhere (including a future
> React Native app).

---

## 4. The `api-client` package

- Generated from the API's **OpenAPI** document (Nest emits it from decorators).
- Provides a typed `LanyardClient` with auth handling, retries, and error mapping to
  `contracts/errors`.
- Regenerated in CI when the OpenAPI spec changes; a drift check fails the build if the
  committed client is stale. This guarantees **API-first** discipline in practice.

---

## 5. Module-boundary rules (enforced by Nx tags)

Every project is tagged; lint rules forbid illegal imports.

| Tag                | May depend on                            | May NOT depend on                       |
| ------------------ | ---------------------------------------- | --------------------------------------- |
| `scope:contracts`  | `scope:utils`                            | anything app/server                     |
| `scope:ui`         | `scope:contracts`, `scope:utils`         | any `app:*`, `scope:server`             |
| `scope:api-client` | `scope:contracts`                        | `scope:ui`, any `app:*`                 |
| `app:store`        | `ui`, `api-client`, `contracts`, `utils` | `app:admin`, `app:api`, `app:marketing` |
| `app:admin`        | `ui`, `api-client`, `contracts`, `utils` | `app:store`, `app:api`, `app:marketing` |
| `app:marketing`    | `ui`, `api-client`, `contracts`, `utils` | other apps                              |
| `app:api`          | `contracts`, `utils`, `observability`    | any `app:web*`, `ui`, `api-client`      |

Result: the backend can never accidentally import React; the customer app can never
import staff-only code. Boundaries are **mechanically enforced**, not just documented.

---

## 6. Versioning & branching

- **Trunk-based** development with short-lived feature branches and PRs.
- **Conventional Commits** → automated changelog and semantic version tagging.
- Protected `main`; required green CI + review before merge.
- Release tags drive immutable, versioned container image builds.

---

## 7. Local developer experience

A new engineer should reach a running stack in minutes:

```
pnpm install
cp infra/env/*.example .env         # documented, no secrets
docker compose -f infra/docker/docker-compose.dev.yml up -d   # mongo, redis, minio, mailpit
pnpm nx run-many -t serve --projects=api,web-store,web-admin
```

- `mongo`, `redis`, `minio` (S3 stand-in), and `mailpit` (email catcher) run in Docker.
- Seed scripts create branches, roles, a superintendent pharmacist, sample catalog, and
  test customers so the platform is explorable immediately.

> See the actual implemented quick-start in the repo [`README.md`](../../README.md);
> the realised commands differ slightly from the illustrative ones above (Turbo, not Nx —
> see ADR-001).

---

## 8. Architecture Decision Records (ADRs)

### ADR-001 — Use Turborepo (not Nx) as the monorepo task runner

**Date:** 2026-06-06 · **Status:** Accepted · **Supersedes:** the Nx choice in §1/AD-01

**Context.** AD-01 originally specified pnpm + **Nx**, chiefly for generators and tag-based
module-boundary lint rules. When scaffolding Phase 0 we needed a runner that is correct,
hand-writable, and verifiable without relying on a generator toolchain.

**Decision.** Use **pnpm workspaces + Turborepo**. Workspace package resolution
(`@lanyard/contracts` as `workspace:*`) gives correct compile- and run-time resolution;
Turbo's `dependsOn: ["^build"]` orders builds (contracts → api). The monorepo rationale in
AD-01 (shared contracts, atomic cross-cutting changes, one CI graph) is **unchanged**.

**Consequences.**

- ✅ Simpler, fully hand-authored config; verified end-to-end (build, typecheck, boot, seed).
- ✅ Standard pnpm resolution — no `tsconfig-paths` runtime hacks for cross-package imports.
- ⚠️ We lose Nx's built-in tag-based boundary enforcement. **Mitigation:** reintroduce the
  module-boundary rules from §5 via an ESLint config (e.g. `eslint-plugin-boundaries` or
  `import/no-restricted-paths`) in a later phase; the boundary _intent_ in §5 still stands.
- ⚠️ No Nx `affected` graph yet. **Mitigation:** Turbo caching + filters cover Phase 0;
  revisit if CI time grows.

This is reversible — task pipelines are the only lock-in.
