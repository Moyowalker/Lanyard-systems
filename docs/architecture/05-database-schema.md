# 05 — Database Schema Design (MongoDB)

> Notation: documents are described as TypeScript-ish shapes for clarity. All collections
> carry `_id` (ObjectId), `createdAt`, `updatedAt`. Money is stored as **integer minor
> units** (kobo) + `currency` — never floats. Soft-deletable docs carry `deletedAt`.

---

## 1. Modeling principles

1. **Branch-first.** Anything whose value differs by location carries `branchId`:
   inventory, pricing, orders, staff assignment, reservations, reports. The **product
   catalog is global**; **availability and price are per-branch**.
2. **Embed what is read together and changes together; reference what is shared or grows
   unbounded.** Order line items are embedded (immutable snapshot); customers, products,
   branches are referenced.
3. **Snapshot at transaction time.** Orders store a **price/name snapshot** of each item
   so historical orders are immutable even if the catalog changes.
4. **Money as integers.** `amount: number (kobo)`, `currency: "NGN"`.
5. **Multi-document ACID via transactions** on the replica set for the few flows that
   need it (order paid → reserve stock → write movement).
6. **Indexes are part of the schema**, designed from query patterns, not added later.
7. **Two identity realms** (customer vs staff) kept in separate collections — different
   lifecycles, fields, and risk profiles.

---

## 2. Collection catalog

```
Identity & access     Commerce core         Operations            Platform
─────────────────     ─────────────         ──────────            ────────
customers             products              prescriptions         audit_logs
staff_users           categories            inventory_items       notifications
roles                 carts                 stock_movements       outbox_events
permissions           orders                deliveries            idempotency_keys
sessions              payment_intents       branches              content_blocks
otp_challenges        payment_txns          price_lists           blog_posts
                      refunds               promotions            leads
```

---

## 3. Identity & access

### `customers`

```ts
{
  _id, phone: string /*E.164, unique*/, email?: string,
  firstName, lastName,
  phoneVerified: boolean, emailVerified: boolean,
  passwordHash?: string,          // optional; OTP-first login supported
  defaultBranchId?: ObjectId,
  status: "active" | "suspended",
  consent: { phiProcessing: boolean, marketing: boolean, version: string, at: Date },
  createdAt, updatedAt
}
```

Indexes: `{phone:1}` unique, `{email:1}` sparse-unique, `{status:1}`.

### `staff_users`

```ts
{
  _id, email: string /*unique*/, phone?,
  firstName, lastName, passwordHash,
  mfaEnabled: boolean, mfaSecretRef?: string,   // secret stored in secrets manager
  roleIds: ObjectId[],
  branchScope: ObjectId[] | "ALL",              // which branches this staff can act on
  pharmacist?: {                                 // present for dispensing staff
    pcnLicenseNo: string, licenseExpiry: Date, isSuperintendent: boolean
  },
  status: "active" | "suspended",
  lastLoginAt?, createdAt, updatedAt
}
```

Indexes: `{email:1}` unique, `{roleIds:1}`, `{branchScope:1}`.

### `roles` / `permissions`

```ts
// roles
{ _id, key: "PHARMACIST"|"BRANCH_MANAGER"|"ADMIN"|"SUPPORT"|"SUPER_ADMIN",
  name, description, permissionKeys: string[], isSystem: boolean }
// permissions  (seeded, append-only catalog)
{ _id, key: "order:read"|"rx:verify"|"refund:create"|..., description, group }
```

RBAC detail in [07](07-auth-rbac.md).

### `sessions`

```ts
{ _id, principalId, principalType: "customer"|"staff",
  refreshTokenHash, deviceInfo, ip, createdAt, expiresAt, revokedAt? }
```

Index: `{principalId:1}`, `{expiresAt:1}` (TTL).

### `otp_challenges`

```ts
{ _id, channel:"sms"|"email", target, codeHash, purpose:"login"|"verify"|"reset",
  attempts:number, maxAttempts:number, expiresAt, consumedAt? }
```

Index: `{target:1, purpose:1}`, `{expiresAt:1}` (TTL).

---

## 4. Branches

### `branches`

```ts
{
  _id, code: string /*unique, e.g. "LAG-IKEJA-01"*/, name,
  status: "active"|"inactive",
  address: { line1, line2?, city, state, country:"NG", geo:{ lat, lng } },
  contact: { phone, email },
  license: { pcnPremisesNo: string, superintendentStaffId: ObjectId },
  hours: [{ day:0..6, open:"HH:mm", close:"HH:mm" }],
  fulfillment: { pickup: boolean, delivery: boolean,
                 deliveryZones?: [{ name, polygonOrRadius, feeKobo, etaMins }] },
  createdAt, updatedAt
}
```

Indexes: `{code:1}` unique, `{status:1}`, `{ "address.geo": "2dsphere" }`.

> **Compliance:** a branch cannot be `active` without a linked, in-date superintendent
> pharmacist (`license.superintendentStaffId`). Enforced in the branch service.

---

## 5. Catalog (global) + per-branch availability

### `categories`

```ts
{ _id, slug:unique, name, parentId?:ObjectId, path:string[], displayOrder, isActive }
```

### `products` (global product master)

```ts
{
  _id, slug:unique, name, genericName?, brand?,
  description, images: string[] /*object-store keys*/,
  form: "tablet"|"capsule"|"syrup"|"injection"|..., strength?: string,
  packSize?: string,
  categoryIds: ObjectId[],
  // --- regulatory (what makes this healthcare) ---
  regulatoryClass: "OTC" | "POM" | "CONTROLLED",   // POM/controlled ⇒ Rx required
  requiresPrescription: boolean,                    // derived but stored for query
  isControlled: boolean,
  nafdacRegNo?: string,
  manufacturer?: string,
  status: "draft"|"published"|"archived",
  searchTokens: string[],                           // normalized for search
  createdAt, updatedAt
}
```

Indexes: `{slug:1}` unique, `{status:1, categoryIds:1}`,
`{requiresPrescription:1}`, **text index** on `{name, genericName, brand, searchTokens}`
(MVP search; Atlas Search / external engine later).

> **Pricing and stock are NOT on the product** — they are per-branch (below). The product
> is the global, branch-agnostic master.

### `price_lists` (per-branch pricing)

```ts
{ _id, branchId, productId,
  priceKobo: number, compareAtKobo?: number, currency:"NGN",
  isAvailable: boolean, effectiveFrom?, effectiveTo?,
  createdAt, updatedAt }
```

Indexes: `{branchId:1, productId:1}` unique, `{branchId:1, isAvailable:1}`.

### `inventory_items` (per-branch stock)

```ts
{
  _id, branchId, productId,
  onHand: number, reserved: number,            // available = onHand - reserved
  reorderLevel: number,
  batches?: [{ batchNo, expiry: Date, quantity: number }],  // expiry tracking
  updatedAt
}
```

Indexes: `{branchId:1, productId:1}` unique, `{branchId:1, "batches.expiry":1}`,
`{onHand:1}` (low-stock scans).

### `stock_movements` (append-only ledger)

```ts
{ _id, branchId, productId, type:"receive"|"reserve"|"release"|"dispense"|"adjust",
  quantity:number /*signed*/, refType?:"order"|"manual", refId?:ObjectId,
  batchNo?, actorId?, reason?, createdAt }
```

Indexes: `{branchId:1, productId:1, createdAt:-1}`, `{refId:1}`. **No updates/deletes.**

---

## 6. Prescriptions (PHI — handle with care)

### `prescriptions`

```ts
{
  _id, customerId, branchId,
  files: [{ objectKey, mime, sizeBytes, avScan: "pending"|"clean"|"infected",
            uploadedAt }],
  status: "pending" | "under_review" | "verified" | "rejected" | "expired",
  prescriber?: { name?, regNo?, hospital? },     // captured if provided
  items?: [{ productId?, freeText?, quantity?, directions? }],
  verification?: {
     pharmacistStaffId: ObjectId, pcnLicenseNo: string,
     decision: "verified"|"rejected", note?, at: Date
  },
  linkedOrderIds: ObjectId[],
  expiresAt?: Date,
  createdAt, updatedAt
}
```

Indexes: `{customerId:1, createdAt:-1}`, `{branchId:1, status:1}`,
`{status:1, createdAt:1}` (pharmacist work queue).

> **Storage:** Rx **images live in the encrypted object store**, never in Mongo. The doc
> holds only `objectKey`s. Access is via **short-lived signed URLs**, every issuance
> **audited**. AV scan runs before any item can be verified.

---

## 7. Cart, Orders, Payments

### `carts`

```ts
{ _id, customerId?, anonId?, branchId,
  items: [{ productId, quantity, requiresPrescription: boolean }],
  prescriptionIds: ObjectId[],
  updatedAt, expiresAt }      // TTL for abandoned carts
```

Index: `{customerId:1}`, `{anonId:1}`, `{expiresAt:1}` (TTL).

### `orders`

```ts
{
  _id,
  orderNo: string /*human-friendly, unique, e.g. LNY-24F3K9*/,
  customerId, branchId,
  status: OrderStatus,                       // state machine (doc 03)
  fulfillment: { type:"pickup"|"delivery",
                 address?: AddressSnapshot, feeKobo?, etaMins? },
  // immutable snapshots:
  items: [{
     productId, name, form, strength,        // snapshot
     unitPriceKobo, quantity, lineTotalKobo,
     requiresPrescription: boolean
  }],
  prescriptionIds: ObjectId[],
  requiresRxVerification: boolean,
  rxVerifiedAt?: Date, rxVerifiedByStaffId?: ObjectId,
  totals: { subtotalKobo, discountKobo, deliveryKobo, totalKobo, currency:"NGN" },
  promotionCodes?: string[],
  payment: { intentId?: ObjectId, status: PaymentStatus, paidAt? },
  statusHistory: [{ from, to, actorId, actorRole, branchId, reason?, at }],
  cancellation?: { reason, byStaffId?, at },
  createdAt, updatedAt
}
```

Indexes: `{orderNo:1}` unique, `{customerId:1, createdAt:-1}`,
`{branchId:1, status:1, createdAt:-1}` (staff queues),
`{status:1, "payment.status":1}` (reconciliation), `{requiresRxVerification:1, status:1}`.

### `payment_intents`

```ts
{ _id, orderId, provider:"paystack"|"flutterwave",
  providerRef: string, ourRef: string /*unique*/,
  amountKobo, currency, status:"created"|"pending"|"succeeded"|"failed"|"abandoned",
  idempotencyKey: string, redirectUrl?, lastWebhookEventId?,
  createdAt, updatedAt }
```

Indexes: `{ourRef:1}` unique, `{orderId:1}`, `{provider:1, providerRef:1}`,
`{status:1, createdAt:1}` (recon).

### `payment_txns` (append-only, from verified webhooks)

```ts
{ _id, intentId, orderId, provider, providerEventId:unique,
  type:"charge"|"refund", status, amountKobo, currency,
  channel?:"card"|"bank_transfer"|"ussd", rawProviderPayload, createdAt }
```

Indexes: `{providerEventId:1}` unique (idempotent webhooks), `{orderId:1}`.

### `refunds`

```ts
{ _id, orderId, intentId, amountKobo, reason, status:"requested"|"processing"|"done"|"failed",
  requestedByStaffId, providerRefundRef?, createdAt, updatedAt }
```

---

## 8. Fulfillment

### `deliveries`

```ts
{ _id, orderId, branchId, type:"delivery",
  status:"queued"|"dispatched"|"out_for_delivery"|"delivered"|"failed",
  address: AddressSnapshot, riderInfo?, trackingEvents:[{status, note?, at}],
  feeKobo, dispatchedAt?, deliveredAt? }
```

(Pickup orders are tracked on the order itself; MVP delivery is manual dispatch.)

### customer addresses (embedded in `customers` or separate)

For MVP, embed `addresses: AddressSnapshot[]` on the customer for simplicity; promote to
a collection if it grows.

---

## 9. Platform collections

### `audit_logs` (append-only, immutable)

```ts
{ _id, at, actorId?, actorType:"customer"|"staff"|"system",
  action: string /*e.g. "rx.verify","refund.create","phi.view"*/,
  targetType, targetId, branchId?, ip?, userAgent?,
  metadata?, before?, after? }
```

Indexes: `{at:-1}`, `{actorId:1, at:-1}`, `{targetType:1, targetId:1}`,
`{action:1, at:-1}`. **App has no update/delete path.** Retained per policy; consider
write-concern + periodic export to immutable storage.

### `outbox_events` (reliable eventing)

```ts
{ _id, type, payload, status:"pending"|"published"|"failed", attempts, createdAt, publishedAt? }
```

Transactional outbox: domain writes + event row commit together; the worker publishes to
queues, guaranteeing no lost domain events.

### `idempotency_keys`

```ts
{ _id, key:unique, scope, requestHash, responseSnapshot?, createdAt, expiresAt }
```

Index: `{key:1}` unique, `{expiresAt:1}` TTL.

### `notifications`

```ts
{ _id, recipientId, recipientType, channel:"sms"|"email"|"whatsapp"|"push",
  template, payload, status:"queued"|"sent"|"failed", providerRef?, error?, createdAt, sentAt? }
```

### `content_blocks` / `blog_posts` / `promotions` / `leads`

Marketing-system collections: editable content, SEO metadata, promo rules
(`code`, type, value, scope: global|branch, validity window, usage limits), and captured
leads from CTAs.

---

## 10. Transaction boundaries (where we use Mongo sessions)

| Flow              | Atomic unit                                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Order paid        | `order.status→PAID` + create reservations + decrement `available` (via `reserved++`) + `stock_movements` + `outbox_events` |
| Dispense/complete | reservation→dispense + `onHand` decrement + `stock_movements` + order→COMPLETED + audit                                    |
| Cancel/refund     | release reservation + `stock_movements` + order→CANCELLED + refund row                                                     |
| Role change       | staff role update + audit + outbox                                                                                         |

Everything else is single-document (Mongo guarantees single-doc atomicity).

---

## 11. Indexing & performance discipline

- Every collection's indexes are **declared in code** (Mongoose schema) and reviewed.
- Compound indexes follow **ESR** (Equality, Sort, Range) ordering for the dominant query.
- TTL indexes auto-expire sessions, OTPs, carts, idempotency keys.
- `2dsphere` on branch geo for the **branch locator** ("nearest branch with stock").
- Search: start with Mongo **text index**; graduate to **Atlas Search** or a dedicated
  engine when catalog/search load demands it.
- Read-heavy dashboards use the `analytics` read models (rollups), not live aggregation
  over hot collections.

---

## 12. Data lifecycle & retention (NDPA-aligned)

| Data                               | Retention                                      | Notes                                 |
| ---------------------------------- | ---------------------------------------------- | ------------------------------------- |
| Prescriptions / dispensing records | Long (regulatory min; confirm with compliance) | PHI; encrypted; access audited        |
| Orders / payment txns              | Financial retention period                     | Immutable history                     |
| Audit logs                         | Long                                           | Append-only; exported to cold storage |
| OTP / sessions / carts             | Minutes–days                                   | TTL auto-expiry                       |
| Marketing leads                    | Until consent withdrawn                        | Honor deletion requests               |

Customer **data-subject requests** (access/deletion) are supported via the customer +
audit modules; deletions are recorded (and PHI/financial data subject to legal holds is
handled per policy, not blindly deleted).
