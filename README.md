# Lanyard Pharmacy — Digital Commerce Platform

A regulated **healthcare commerce** ecosystem (Nigeria) made of four systems on one
platform engine: marketing site, customer commerce, staff operations, and the API engine.

> 📐 **Architecture & design:** start at [`docs/architecture/`](docs/architecture/README.md).

## Monorepo layout

```
apps/
  api/                 # NestJS Platform Engine (HTTP + worker)   [scaffolded]
  web-marketing/       # Next.js marketing site                   (later)
  web-store/           # Next.js customer commerce                (later)
  web-admin/           # Next.js staff operations                 (later)
packages/
  contracts/           # Shared enums / DTOs / schemas (SoT)      [scaffolded]
infra/
  docker/              # docker-compose + Dockerfiles
docs/architecture/     # canonical architecture record
```

Tooling: **pnpm workspaces + Turborepo**, TypeScript end-to-end.

## Prerequisites

- Node `>= 20` (`.nvmrc`)
- pnpm `>= 10` (`corepack enable`)
- Docker (for local Mongo/Redis/MinIO/Mailpit)

## Quick start (local)

```bash
pnpm install

# bring up dev backing services (Mongo replica set, Redis, MinIO, Mailpit)
docker compose -f infra/docker/docker-compose.dev.yml up -d

# configure the API
cp apps/api/.env.example apps/api/.env

# build shared packages, then run the API
pnpm build
pnpm --filter @lanyard/api start:dev      # http://localhost:4000/api/v1
# API docs (OpenAPI):                       http://localhost:4000/api/v1/docs
# health:                                    http://localhost:4000/api/v1/health/ready

# seed reference data (branches, roles, a superintendent pharmacist, sample catalog)
pnpm --filter @lanyard/api seed
```

Local service consoles: MinIO `http://localhost:9001`, Mailpit `http://localhost:8025`.

## Common scripts

| Command                                   | What                                                    |
| ----------------------------------------- | ------------------------------------------------------- |
| `pnpm build`                              | Build all packages (Turbo, dependency-ordered)          |
| `pnpm typecheck`                          | Type-check everything                                   |
| `pnpm format`                             | Prettier write                                          |
| `pnpm --filter @lanyard/api start:dev`    | Run the API in watch mode                               |
| `pnpm --filter @lanyard/api start:worker` | Run the queue worker (processors added in later phases) |

## Status

As of 2026-06-07, the backend package (`apps/api`) passes build, typecheck, unit tests,
and integration tests.

Swagger UI is exposed at `http://localhost:4000/api/v1/docs` in local development.

For the production topology, Hostinger VPS deployment and rollback procedure, and
shareable Swagger URL patterns, see
[docs/architecture/11-hostinger-readiness.md](docs/architecture/11-hostinger-readiness.md).

Production runs the API, worker, Redis, Caddy, and three Next.js apps on a Hostinger VPS.
MongoDB Atlas and the private S3-compatible object store remain external managed services.

Overall product scope and launch sequencing still follow
[docs/architecture/09-mvp-definition.md](docs/architecture/09-mvp-definition.md).
