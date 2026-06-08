# 03 — Backend Module Design (Platform Engine)

NestJS modular monolith. Each module owns its domain, its persistence, and its public
service interface. Modules talk to each other **only** through injected service
interfaces or the internal **event bus** — never by querying another module's
collections directly. This is what makes future extraction to a service possible.

---

## 1. Module map

```
apps/api/src/
├── main.ts                 # HTTP bootstrap
├── worker.ts               # Queue-consumer bootstrap (same modules, no HTTP)
├── app.module.ts
│
├── core/                   # cross-cutting, imported everywhere
│   ├── config/             # typed config + env validation
│   ├── logging/            # pino logger, request context
│   ├── events/             # internal event bus (EventEmitter → optional durable)
│   ├── audit/              # audit interceptor + AuditService
│   ├── errors/             # exception filters → canonical error codes
│   ├── idempotency/        # idempotency-key middleware + store
│   ├── pagination/         # cursor/offset helpers
│   └── database/           # Mongo connection, transaction helper, base repo
│
├── modules/
│   ├── identity/           # users (customer + staff realms), sessions, OTP, MFA
│   ├── authz/              # roles, permissions, policy guards, branch scoping
│   ├── branch/             # branches, operating hours, service areas
│   ├── catalog/            # products, categories, brands, regulatory metadata
│   ├── inventory/          # per-branch stock, reservations, adjustments
│   ├── pricing/            # per-branch pricing, promotions, discounts
│   ├── prescription/       # Rx upload, verification workflow, dispensing record
│   ├── cart/               # carts, line items, Rx linkage
│   ├── order/              # order state machine, fulfillment, tracking
│   ├── payment/            # provider adapters, init, webhook verify, refund, recon
│   ├── delivery/           # delivery vs pickup, addresses, dispatch (MVP: manual)
│   ├── customer/           # customer profile, saved addresses, preferences
│   ├── notification/       # multi-channel templated messaging
│   ├── analytics/          # read-model aggregations for dashboards/reports
│   ├── content/            # marketing content: promos, FAQ, blog, branch locator
│   └── integration/        # external provider clients (SMS/email/whatsapp/maps)
│
└── jobs/                   # BullMQ processors (consume events/queues)
    ├── av-scan.processor.ts
    ├── notification.processor.ts
    ├── payment-recon.processor.ts
    ├── report.processor.ts
    └── inventory-expiry.processor.ts
```

---

## 2. Module responsibilities & key boundaries

| Module           | Owns (write)                               | Reads (via service)                              | Emits events                                                                       |
| ---------------- | ------------------------------------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| **identity**     | users, sessions, OTPs, MFA secrets         | —                                                | `user.registered`, `user.locked`                                                   |
| **authz**        | roles, permissions, role assignments       | identity                                         | `role.assigned`                                                                    |
| **branch**       | branches, hours, delivery zones            | —                                                | `branch.activated`                                                                 |
| **catalog**      | products, categories, regulatory class     | —                                                | `product.published`                                                                |
| **inventory**    | stock levels, reservations, batches/expiry | catalog, branch                                  | `stock.low`, `stock.reserved`, `stock.released`                                    |
| **pricing**      | price lists, promotions                    | catalog, branch                                  | `promotion.started`                                                                |
| **prescription** | Rx documents, verification, dispensing log | identity, catalog                                | `rx.uploaded`, `rx.verified`, `rx.rejected`                                        |
| **cart**         | carts, line items                          | catalog, pricing, inventory, prescription        | —                                                                                  |
| **order**        | orders, status history, fulfillment        | cart, inventory, pricing, prescription, customer | `order.created`, `order.paid`, `order.ready`, `order.completed`, `order.cancelled` |
| **payment**      | payment intents, transactions, refunds     | order                                            | `payment.succeeded`, `payment.failed`, `payment.refunded`                          |
| **delivery**     | dispatch records, tracking states          | order, branch                                    | `delivery.dispatched`, `delivery.delivered`                                        |
| **customer**     | profiles, addresses, preferences           | identity                                         | —                                                                                  |
| **notification** | message log, templates, preferences        | identity, customer                               | `notification.sent`, `notification.failed`                                         |
| **analytics**    | read models / rollups                      | (subscribes to all events)                       | —                                                                                  |
| **content**      | promos, FAQ, blog, locator data            | branch                                           | —                                                                                  |
| **integration**  | provider credentials/clients               | —                                                | —                                                                                  |

**Communication rules:**

1. Cross-module reads go through the **owning module's service interface**, returning DTOs.
2. Side effects across modules are triggered by **events**, not direct mutation.
3. Transactions that must be atomic (e.g. order paid → reserve stock) use a single
   MongoDB session coordinated by the **order** module's application service.

---

## 3. Internal layering inside a module

Each module follows the same shape (clean-ish architecture, pragmatic):

```
modules/order/
├── order.module.ts
├── api/                    # controllers (HTTP) — thin, validation + mapping only
│   ├── order.controller.ts
│   └── order-admin.controller.ts
├── application/            # use-cases / services — business logic, orchestration
│   ├── order.service.ts
│   ├── order-state-machine.ts
│   └── fulfillment.service.ts
├── domain/                 # entities, value objects, state rules, domain events
│   ├── order.entity.ts
│   ├── order-status.ts
│   └── order.events.ts
├── infrastructure/         # persistence (Mongoose schemas + repositories)
│   ├── order.schema.ts
│   └── order.repository.ts
└── order.events-handlers.ts# reacts to payment.succeeded, rx.verified, etc.
```

- **Controllers are thin.** Validate DTO → call application service → map to response.
- **Business rules live in `application`/`domain`,** never in controllers or schemas.
- **Repositories** wrap Mongoose; the rest of the module depends on the repository
  interface, not Mongoose directly (keeps domain testable and DB-swappable in theory).

---

## 4. The Order state machine (heart of the platform)

Orders are governed by an explicit, auditable state machine. Illegal transitions throw.

```
                 ┌─────────┐
                 │ CREATED │  cart converted; totals computed
                 └────┬────┘
        has Rx items? │
            ┌─────────┴───────────┐
            ▼ yes                 ▼ no
   ┌──────────────────┐          │
   │ AWAITING_RX_      │          │
   │ VERIFICATION      │          │
   └───┬──────────┬────┘          │
 verify│      reject│             │
       ▼            ▼             │
 ┌──────────┐  ┌──────────┐       │
 │ VERIFIED │  │ REJECTED │(end)  │
 └────┬─────┘  └──────────┘       │
      └──────────────┬────────────┘
                     ▼
              ┌─────────────┐  payment intent created
              │ AWAITING_   │  (Paystack/Flutterwave)
              │ PAYMENT     │
              └──────┬──────┘
         webhook ok  │  fail/abandon/timeout
              ┌──────┴────────┐
              ▼               ▼
        ┌──────────┐    ┌───────────┐
        │  PAID    │    │ PAYMENT_  │──▶ retry → AWAITING_PAYMENT
        │ (stock   │    │ FAILED    │    or CANCELLED
        │ reserved)│    └───────────┘
        └────┬─────┘
             ▼
       ┌────────────┐  pharmacist/branch picks & packs
       │ FULFILLING │
       └─────┬──────┘
   pickup    │     delivery
      ┌──────┴────────┐
      ▼               ▼
 ┌─────────┐   ┌─────────────────┐
 │ READY_  │   │ OUT_FOR_DELIVERY│
 │ FOR_    │   └────────┬────────┘
 │ PICKUP  │            │
 └────┬────┘            │
      └───────┬─────────┘
              ▼
        ┌───────────┐   (dispensing recorded;
        │ COMPLETED │    stock decremented; receipt)
        └───────────┘

  CANCELLED / REFUNDED reachable from PAID/FULFILLING per policy →
  releases reservation, triggers refund through payment module.
```

Each transition records: `from`, `to`, `actorId`, `actorRole`, `branchId`, `reason`,
`timestamp` → both in the order's `statusHistory` and the global audit log.

---

## 5. Inventory consistency model

Per-branch stock with a **reservation** concept to prevent overselling:

- `available = onHand - reserved`
- **At PAID:** create reservations against the fulfilling branch (atomic, in the order
  transaction). If insufficient stock → order goes to a `STOCK_HOLD` exception for staff.
- **At COMPLETED:** convert reservation → decrement `onHand` and write a stock movement.
- **At CANCELLED/REFUNDED/expiry:** release reservation.
- Reservations have a **TTL**; an `inventory-expiry` job releases stale ones.
- All stock changes write an immutable **stock movement** record (auditable, supports
  reconciliation and batch/expiry tracking for NAFDAC-relevant items).

---

## 6. Payment orchestration (provider-agnostic)

```
PaymentService
   ├── PaymentProvider (interface)
   │     ├── initialize(order) → { reference, redirectUrl | inlineConfig }
   │     ├── verify(reference) → { status, amount, currency, raw }
   │     ├── refund(txn, amount) → refundResult
   │     └── parseWebhook(headers, rawBody) → normalized event   (signature-checked)
   ├── PaystackAdapter   implements PaymentProvider
   └── FlutterwaveAdapter implements PaymentProvider
```

Rules:

- **Initialize** stores a `PaymentIntent` with our order ref + provider ref +
  **idempotency key**.
- **Webhooks are the source of truth.** We verify the provider signature, match the
  reference, confirm **amount + currency** equal the order, then transition the order.
  A client returning to a "success" URL never moves money state on its own.
- **Idempotent webhook handling:** repeated deliveries are deduped by provider event id.
- **Reconciliation job** periodically calls `verify()` for intents stuck in
  AWAITING_PAYMENT to catch missed webhooks.

---

## 7. Notification module

- Channel-agnostic core; adapters for **SMS, Email, WhatsApp, (push later)**.
- **Event-driven:** subscribes to domain events (`order.paid`, `rx.verified`, `stock.low`)
  and enqueues messages to BullMQ; the worker renders templates and calls providers.
- Honors per-user **channel preferences** and quiet hours; logs every send for audit.
- Nigeria-first: SMS and WhatsApp are primary; OTP delivery shares this module.

---

## 8. Audit module (compliance backbone)

- A global **interceptor** records mutating requests (actor, action, target, branch, IP,
  before/after where appropriate).
- Domain modules also emit explicit audit entries for high-sensitivity actions:
  **Rx access, Rx verification, dispensing, refunds, role changes, PHI exports.**
- The audit collection is **append-only** (no update/delete via app), retained per the
  data-retention policy. See [05](05-database-schema.md) and [10](10-risks-mitigation.md).

---

## 9. Worker mode

- `worker.ts` boots the same `AppModule` (so all services/repos are available) but
  starts **BullMQ processors** instead of the HTTP server.
- Scales independently of the API by queue depth.
- Processors: AV-scan prescriptions, send notifications, payment reconciliation, report
  generation, inventory-expiry sweeps, scheduled analytics rollups.

---

## 10. Testing strategy (backend)

| Level        | Scope                                             | Tooling               |
| ------------ | ------------------------------------------------- | --------------------- |
| Unit         | domain rules, state machine, pricing, adapters    | Jest                  |
| Integration  | module + real Mongo/Redis (testcontainers)        | Jest + testcontainers |
| Contract     | controllers vs OpenAPI/zod schemas                | Jest + zod            |
| E2E (API)    | critical flows: Rx order, payment webhook, refund | Jest + supertest      |
| Load (later) | catalog + checkout under concurrency              | k6                    |

Mandatory coverage gates focus on **order, payment, prescription, inventory, authz** —
the modules where a defect is a safety, money, or compliance event.
