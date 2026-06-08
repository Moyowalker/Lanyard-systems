# 01 — System Architecture

## 1. Goals & quality attributes

We optimize, in priority order, for:

1. **Correctness & safety** — wrong medicine, wrong dose, or dispensing an Rx drug
   without verification is a patient-safety and legal event, not a bug ticket.
2. **Auditability** — every money movement and every PHI access is reconstructable.
3. **Security & privacy** — PHI and payment integrity are non-negotiable.
4. **Operational simplicity** — a small team must run this reliably.
5. **Evolvability** — clean module boundaries so we can scale and split later.
6. **Performance** — fast catalog and checkout, tolerant of Nigerian network conditions.

We explicitly **de-prioritize** premature distributed-systems complexity. We do not
start with microservices, event sourcing, or multi-region active-active.

---

## 2. Architectural style

- **Backend: Modular Monolith** (NestJS). One deployable API process, internally
  organized into strongly-bounded domain modules that communicate through service
  interfaces and an internal event bus — **not** by reaching into each other's data.
  This gives microservice-like boundaries with monolith-like operational and
  transactional simplicity. Modules are designed so any one can be extracted into a
  standalone service later (strangler pattern) without a rewrite.
- **Frontend: Multiple Next.js applications** sharing a UI + contracts layer.
- **API-first:** the NestJS API is the single source of truth. Every UI and the future
  mobile app are clients of the same versioned, documented API.
- **Branch-first:** `branchId` is a primary scoping dimension across catalog
  availability, inventory, pricing, fulfillment, staff, and reporting.

---

## 3. System context (C4 — Level 1)

```
                         ┌──────────────────────────────────────┐
   Public visitor ──────▶│        Marketing Website (web)        │
                         └───────────────┬──────────────────────┘
                                         │ CTA: Shop / Upload Rx
   Patient / buyer ─────▶┌───────────────▼──────────────────────┐
                         │   Customer Commerce Platform (web)    │
                         └───────────────┬──────────────────────┘
                                         │ HTTPS / REST (+OpenAPI)
   Pharmacist /          ┌───────────────▼──────────────────────┐
   manager / admin ─────▶│   Staff Operations Platform (web)     │
                         └───────────────┬──────────────────────┘
                                         │
                         ┌───────────────▼──────────────────────┐
                         │      PLATFORM ENGINE  (NestJS API)    │
                         │  AuthZ · Catalog · Orders · Payments  │
                         │  Rx · Inventory · Notifications · Audit│
                         └──┬───────┬────────┬─────────┬────────┘
                            │       │        │         │
                  ┌─────────▼─┐ ┌───▼───┐ ┌──▼────┐ ┌──▼─────────┐
                  │ MongoDB   │ │ Redis │ │ Object│ │ External:  │
                  │ (replica  │ │(queue/│ │ Store │ │ Paystack/  │
                  │  set)     │ │ cache)│ │ (S3)  │ │ Flutterwave│
                  └───────────┘ └───────┘ └───────┘ │ SMS/Email/ │
                                                     │ WhatsApp   │
                                                     └────────────┘
```

---

## 4. Container view (C4 — Level 2)

| Container       | Tech                                | Responsibility                                               | Scaling unit                     |
| --------------- | ----------------------------------- | ------------------------------------------------------------ | -------------------------------- |
| `web-marketing` | Next.js (SSG/ISR)                   | Brand, SEO, lead capture                                     | CDN/edge, mostly static          |
| `web-store`     | Next.js (SSR + CSR)                 | Customer commerce journeys                                   | Horizontal (stateless)           |
| `web-admin`     | Next.js (CSR-heavy, auth-gated)     | Staff operations console                                     | Horizontal (stateless)           |
| `api`           | NestJS (HTTP)                       | All business logic & contracts                               | Horizontal (stateless)           |
| `worker`        | NestJS (same image, queue consumer) | Async jobs (notifications, reconciliation, reports, AV scan) | Horizontal by queue depth        |
| `mongodb`       | MongoDB replica set                 | System of record                                             | Vertical + replicas; shard later |
| `redis`         | Redis                               | Queues (BullMQ), cache, rate-limit, sessions                 | Managed/clustered                |
| `object-store`  | S3-compatible                       | Prescription images, documents, exports                      | Managed                          |

> **Key point:** `api` and `worker` run the **same codebase/image** in different
> modes. This keeps business logic in one place; the worker just boots queue
> consumers instead of the HTTP server.

---

## 5. The four systems → platform mapping

### System 1 — Marketing Website

- Mostly static/ISR for SEO and speed. Talks to the API only for: lead capture,
  promotions feed, branch locator data, and blog content (later via CMS or DB).
- Owns no business state. Heavy CDN caching.

### System 2 — Customer Commerce Platform

- The revenue surface. Authenticated customer journeys: browse → Rx upload → cart →
  checkout → pay → track. Branch selection drives availability and pricing.

### System 3 — Staff Operations Platform

- The control center. Pharmacists verify prescriptions; managers manage inventory and
  orders; admins manage staff, branches, catalog. Everything here is **audited** and
  **branch-scoped by role**.

### System 4 — Platform Engine

- The brain. Authentication, authorization, business rules, the order state machine,
  payment orchestration, queues, notifications, audit, and external integrations.
- Exposes one **versioned REST API** (`/api/v1`) consumed by all three frontends and
  the future mobile app.

---

## 6. Cross-cutting concerns (owned by the engine)

| Concern        | Mechanism                                                           |
| -------------- | ------------------------------------------------------------------- |
| AuthN          | JWT access + rotating refresh tokens; OTP; staff MFA                |
| AuthZ          | RBAC (role→permission) + **branch-scoped** policy guards            |
| Validation     | DTOs validated at the edge (class-validator/zod); never trust input |
| Idempotency    | Idempotency keys on payment + order-mutating endpoints              |
| Audit          | Append-only audit log via interceptor + explicit domain events      |
| Observability  | Structured logs (pino), traces, metrics, error tracking (Sentry)    |
| Rate limiting  | Per-IP + per-user throttling at the edge and on sensitive routes    |
| Config/secrets | Env-driven config schema; secrets from a manager, never in repo     |
| Eventing       | Internal event bus (in-process) → optionally durable via queue      |

---

## 7. End-to-end flow: prescription order (the canonical journey)

This single flow exercises nearly every part of the platform.

```
Customer                Engine (api)                 Worker            External
   │                        │                          │                  │
   │ 1. Select branch       │                          │                  │
   │───────────────────────▶│ availability = f(branch) │                  │
   │ 2. Upload prescription │                          │                  │
   │───────────────────────▶│ store image (S3), create │                  │
   │                        │ Prescription{PENDING}    │                  │
   │                        │ enqueue AV scan ─────────▶│ scan + thumbnail │
   │ 3. Add items to cart   │                          │                  │
   │───────────────────────▶│ validate Rx-required     │                  │
   │ 4. Checkout            │                          │                  │
   │───────────────────────▶│ Order{CREATED}           │                  │
   │                        │ has Rx items? → requires │                  │
   │                        │ PHARMACIST_VERIFICATION  │                  │
   │   (Pharmacist, admin app) verifies Rx ───────────▶ Order{VERIFIED}   │
   │ 5. Pay                 │                          │                  │
   │───────────────────────▶│ init payment ───────────────────────────────▶ Paystack
   │◀── redirect/inline ────│                          │                  │
   │   pays on provider ────────────────────────────────────────────────▶ Paystack
   │                        │◀──────── webhook (verified) ─────────────────│
   │                        │ Order{PAID}; reserve     │                  │
   │                        │ inventory; enqueue        │                 │
   │                        │ fulfillment + notify ────▶│ SMS/email/whatsapp▶ provider
   │ 6. Track               │ FULFILLING→READY/         │                  │
   │───────────────────────▶│ OUT_FOR_DELIVERY→        │                  │
   │                        │ COMPLETED                 │                 │
```

**Non-negotiable rules embedded above:**

- Rx items **cannot** progress past verification without a registered pharmacist's
  action, which is **audited** (who, when, which license).
- Payment success is recognized **only** from a verified provider **webhook**, never
  from a client redirect.
- Inventory is **reserved** at payment, **decremented** at fulfillment, **released** on
  cancellation/expiry — always scoped to the fulfilling branch.

---

## 8. Technology decisions & rationale

| Area              | Decision                           | Rationale                                                                                       | Trade-off accepted                       |
| ----------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Backend framework | NestJS                             | DI, modular structure, guards/interceptors, OpenAPI, queues — fits a modular monolith perfectly | Opinionated/heavier than Express         |
| Frontend          | Next.js (App Router)               | SSR/SSG/ISR for SEO + dynamic commerce; React ecosystem                                         | App Router learning curve                |
| Language          | TypeScript end-to-end              | Shared types across API↔UI; safer refactors                                                     | Build tooling overhead                   |
| DB                | MongoDB (replica set)              | Flexible catalog/Rx documents; multi-doc ACID txns on replica set                               | Must enforce schema discipline + indexes |
| Async             | BullMQ + Redis                     | Mature, observable queues; same language                                                        | Operational dependency on Redis          |
| Object store      | S3-compatible                      | Cheap, durable, signed URLs for PHI                                                             | External dependency                      |
| Payments          | Paystack + Flutterwave via adapter | Local rails (cards, transfer, USSD); avoid lock-in                                              | Two integrations to maintain             |
| Repo              | Monorepo (pnpm + Nx)               | Shared contracts, atomic changes, affected-graph CI                                             | Tooling complexity                       |

ADRs for any change to the above belong in this file's appendix.

---

## 9. What we are deliberately NOT doing (yet)

- ❌ Microservices / service mesh — premature for team size and traffic.
- ❌ Event sourcing / CQRS as a global pattern — targeted only where it earns its keep.
- ❌ Multi-region active-active — single region + backups first.
- ❌ Custom auth crypto — use vetted libraries and provider OTP/MFA.
- ❌ GraphQL gateway — REST + OpenAPI is sufficient and simpler to secure/audit.

These remain on the table as the platform grows; the modular boundaries keep the door open.
