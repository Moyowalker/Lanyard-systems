# 06 — API Design

**API-first.** The NestJS API is the contract every client (store, admin, marketing,
future mobile) consumes. It is versioned, documented via OpenAPI, and typed end-to-end.

---

## 1. Conventions

| Aspect         | Convention                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------- |
| Base path      | `/api/v1` (version in the path; additive changes don't bump; breaking changes → `/v2`)      |
| Style          | REST, resource-oriented, JSON only                                                          |
| Naming         | Plural nouns: `/products`, `/orders`; sub-resources nested where it aids clarity            |
| Casing         | `camelCase` JSON fields (matches TS)                                                        |
| Auth           | Bearer access token (or httpOnly cookie for web BFF); see [07](07-auth-rbac.md)             |
| Branch context | `X-Branch-Id` header (or query) for branch-scoped reads; validated against the user's scope |
| Idempotency    | `Idempotency-Key` header **required** on payment + order-create mutations                   |
| Pagination     | Cursor-based: `?limit=&cursor=`; responses return `nextCursor`                              |
| Filtering/sort | Whitelisted `?filter[...]=` and `?sort=` params, never raw query passthrough                |
| Rate limiting  | Per-IP global + stricter per-route (auth, OTP, payment) → `429` with `Retry-After`          |
| Time           | ISO-8601 UTC everywhere                                                                     |
| Money          | Integer minor units + currency, never floats                                                |

---

## 2. Standard response envelopes

**Success**

```json
{
  "data": {
    /* resource or list */
  },
  "meta": { "nextCursor": "..." }
}
```

**Error** (canonical codes from `@lanyard/contracts/errors`)

```json
{
  "error": {
    "code": "RX_VERIFICATION_REQUIRED",
    "message": "This order contains prescription-only items awaiting pharmacist verification.",
    "details": [{ "field": "items[2].productId", "issue": "requiresPrescription" }],
    "traceId": "01J..."
  }
}
```

**HTTP status usage:** `200/201/204` success; `400` validation; `401` unauthenticated;
`403` unauthorized (incl. branch-scope violation); `404` not found; `409` conflict
(state-machine/idempotency); `422` business-rule violation; `429` rate limited;
`5xx` server. Every error carries a `traceId` correlating to logs.

---

## 3. Resource map (representative — not exhaustive)

### Public / marketing (no auth)

```
GET  /content/home
GET  /content/promotions
GET  /content/faq
GET  /content/blog            ?cursor=
GET  /content/blog/:slug
GET  /branches               ?near=lat,lng&service=delivery
POST /leads                  # contact / lead capture
```

### Auth & identity

```
POST /auth/customer/register
POST /auth/customer/otp/request        # phone-first
POST /auth/customer/otp/verify         # → tokens
POST /auth/customer/login              # email/password optional
POST /auth/staff/login                 # → MFA challenge if enabled
POST /auth/staff/mfa/verify
POST /auth/refresh                     # rotating refresh token
POST /auth/logout
GET  /me                               # current principal + permissions + branchScope
```

### Catalog & search (public read, branch-aware)

```
GET  /catalog/categories
GET  /catalog/products       ?category=&q=&cursor=        # branch-scoped price/availability
GET  /catalog/products/:slug
GET  /catalog/search         ?q=                          # text search
```

> Listing responses fold in **per-branch price + availability** when `X-Branch-Id` set.

### Prescriptions (customer)

```
POST /prescriptions                    # multipart → returns objectKey refs + Rx id
GET  /prescriptions                    # mine
GET  /prescriptions/:id
GET  /prescriptions/:id/files/:fileId/url   # short-lived signed URL (audited)
```

### Cart & checkout (customer)

```
GET    /cart
PUT    /cart/items                      # upsert line items
DELETE /cart/items/:productId
POST   /cart/prescriptions              # link Rx to cart
POST   /checkout/quote                  # totals, delivery fee, Rx-required preview
POST   /orders                          # create order (Idempotency-Key)   → state machine
```

### Orders (customer)

```
GET  /orders                            # mine
GET  /orders/:id
POST /orders/:id/cancel                 # if policy allows
GET  /orders/:id/tracking
```

### Payments

```
POST /payments/intents                  # init for an order (Idempotency-Key) → redirect/inline
GET  /payments/intents/:id              # status (client polls only for UX, not truth)
POST /webhooks/paystack                 # provider → us (signature-verified, idempotent)
POST /webhooks/flutterwave
```

> Webhooks are **unauthenticated by token but signature-verified**; they are the **only**
> authority on payment success. Mounted outside the normal auth guard, with raw-body
> parsing for signature checks.

### Staff — operations (auth + RBAC + branch scope)

```
# Prescription verification (pharmacist)
GET   /admin/prescriptions          ?status=pending          # work queue, branch-scoped
GET   /admin/prescriptions/:id
POST  /admin/prescriptions/:id/verify    { decision, note }  # records PCN license — AUDITED
POST  /admin/prescriptions/:id/reject    { reason }

# Orders
GET   /admin/orders                 ?status=&branchId=
GET   /admin/orders/:id
POST  /admin/orders/:id/transition  { to, reason }           # guarded by state machine
POST  /admin/orders/:id/refund      { amountKobo, reason }

# Catalog / pricing / inventory
POST/PATCH /admin/products ...
PUT   /admin/branches/:id/prices                              # per-branch pricing
GET   /admin/inventory              ?branchId=&lowStock=true
POST  /admin/inventory/adjust       { productId, delta, reason }
POST  /admin/inventory/receive      { productId, quantity, batchNo, expiry }

# People & places
GET/POST/PATCH /admin/customers ...
GET/POST/PATCH /admin/staff ...        # admin only
GET/POST/PATCH /admin/branches ...     # admin only
GET/POST       /admin/roles ...        # super-admin only

# Insight
GET   /admin/dashboard               ?branchId=
GET   /admin/reports/:type           ?from=&to=&branchId=    # async for large → job + download
GET   /admin/audit-logs              ?actor=&action=&from=&to=   # read-only
```

---

## 4. Cross-cutting behaviors

| Behavior           | Implementation                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------- |
| **Validation**     | DTOs validated with zod/class-validator at the controller edge; reject unknown fields                   |
| **AuthZ**          | Guards check permission + branch scope before the handler runs (doc 07)                                 |
| **Idempotency**    | Key stored with request hash; replay returns the original response, never double-charges/double-creates |
| **Pagination**     | Opaque cursor encodes sort key + `_id`; stable under inserts                                            |
| **Audit**          | Interceptor logs mutations; sensitive routes add explicit audit entries                                 |
| **Tracing**        | `traceId` generated per request, propagated to logs, jobs, and error reports                            |
| **Errors**         | Global exception filter maps domain errors → canonical codes + status                                   |
| **Versioning**     | OpenAPI doc per version; `api-client` regenerated; CI drift check                                       |
| **Webhook safety** | Raw body + signature verify + provider-event-id dedupe + amount/currency match                          |

---

## 5. OpenAPI & client generation

- Controllers are decorated so Nest emits a complete **OpenAPI 3** document at build time.
- `packages/api-client` is **generated** from that document; a CI step regenerates and
  fails if the committed client drifts. This enforces API-first in practice and gives the
  frontends (and future mobile app) a fully typed SDK for free.

---

## 6. Example: creating an Rx order (happy path)

```
1. POST /checkout/quote            → totals, requiresRxVerification:true, deliveryFee
2. POST /orders   (Idempotency-Key)→ 201 { status: "AWAITING_RX_VERIFICATION" }
   …pharmacist verifies via /admin/prescriptions/:id/verify…
   (order auto-transitions to AWAITING_PAYMENT via rx.verified event)
3. POST /payments/intents          → 201 { redirectUrl }     # client pays on provider
4. POST /webhooks/paystack         → server verifies → order PAID, stock reserved, notify
5. GET  /orders/:id/tracking       → FULFILLING → READY_FOR_PICKUP / OUT_FOR_DELIVERY → COMPLETED
```

Notice the client **cannot** skip verification or self-confirm payment — both gates are
server-enforced and audited.

---

## 7. API design rules (the guardrails)

1. **Never trust the client** for price, availability, Rx-required flags, or payment
   status — recompute/verify server-side.
2. **Branch scope is enforced server-side**, regardless of headers the client sends.
3. **Mutations that move money or stock are idempotent.**
4. **Breaking changes require a new version**; everything else is additive.
5. **Every sensitive read/write is auditable** with actor + branch + trace.
