# Pre-Launch Feature Backlog — Competitive Gap Closure

Scoped tickets derived from the competitive gap analysis (vs. Jumia Health, Amazon
Pharmacy, Capsule, Walgreens, CVS). These are **product/feature** tickets and are
independent of the security blockers in [production-readiness.md](production-readiness.md) —
do not let them jump the P0 queue.

> Each ticket cites real files. Effort is rough dev-days for one engineer. "Schema delta"
> = additive only; nothing here requires a destructive migration. Validated against the
> codebase 2026-06-12.

---

## Sequencing summary

| # | Ticket | Impact | Effort | Notes |
| --- | --- | --- | --- | --- |
| T1 | Guest cart + merge on login | High (conversion) | ~2d | Schema already supports `anonId` |
| T2 | Reorder / refill from order history | High (pharmacy lifecycle) | ~2d | Order items already snapshotted |
| T3 | Rx clarification ("needs info") loop | High (safety + saved orders) | ~3d | Additive enum + status |
| T4 | Product image upload + rendering | Med-High (credibility) | ~2–3d | `Product.images[]` already exists |
| T5 | Surface trust signals | High (trust, low effort) | ~1–2d | Data already captured |
| T6 | Delivery ETA + per-zone fee | Medium (promise clarity) | ~1–2d | `deliveryZones.etaMins` already exists |

Recommended order: **T5 → T1 → T2 → T6 → T4 → T3** (fastest trust/conversion wins first;
T3 is the most cross-cutting so it lands last).

---

## T1 — Guest cart + merge on login

**Why:** Cart currently requires a customer token, so anonymous shoppers can't build a
basket — a measurable conversion tax every comparator avoids.

**The good news:** [cart.schema.ts](../apps/api/src/modules/cart/infrastructure/cart.schema.ts)
already has an indexed `anonId?: string` ("Either customer-owned or anonymous") and a TTL.
The persistence layer is done.

**Scope**
- **API — `CartService`** ([cart.service.ts](../apps/api/src/modules/cart/application/cart.service.ts)):
  generalize `getOrCreate(customerId)` → resolve by `{ customerId }` OR `{ anonId }`. Add
  `merge(anonId, customerId)`: fold the guest cart's items/branch into the customer cart
  (or adopt it if none), then delete the guest cart.
- **API — `CartController`** ([cart.controller.ts](../apps/api/src/modules/cart/api/cart.controller.ts)):
  relax `@RequireRealm('customer')` on cart routes to allow an anonymous principal carrying
  `anonId`; add `POST /cart/merge`. Keep checkout/order creation customer-only.
- **Auth/principal:** allow a lightweight anonymous context (no JWT) keyed on a signed
  `anonId` cookie issued by the store BFF; OR keep the BFF as the only caller and pass
  `anonId` through. Prefer the BFF approach to avoid loosening the global JWT guard.
- **Store BFF** (`/api/cart/*`): issue/read an `lny_anon` httpOnly cookie; forward `anonId`
  when no access token. On successful OTP verify
  ([otp/verify/route.ts](../apps/web-store/src/app/api/auth/otp/verify/route.ts)), call
  `/cart/merge` then clear `lny_anon`.
- **Store UI:** `AddToCartButton` works logged-out; `CartLink` count reflects guest cart.

**Acceptance**
- Logged-out user adds items, sees cart, and the basket survives login (merged, not lost).
- No prescription/checkout action is possible while anonymous (still gated).

**Effort:** ~2d. **Risk:** keep the anonymous path off the JWT guard — route it only through the BFF.

---

## T2 — Reorder / refill from order history

**Why:** The defining pharmacy behavior. Every comparator leads with 2-tap reorder; Lanyard
restarts from search each time.

**The good news:** orders already store immutable item snapshots
([order.schema.ts](../apps/api/src/modules/order/infrastructure/order.schema.ts)), so a
reorder is "re-add these productIds to the cart," not a data rebuild.

**Scope**
- **API — `OrderService`/`CartService`:** `reorder(customerId, orderId)` → load the order,
  re-add each `productId` + `quantity` to the cart at the order's `branchId` (reuse
  `cart.addItem`, which already re-validates availability/price and resets the basket on
  branch switch). Return the resolved cart; surface any now-unavailable lines.
- **API — `OrderController`** ([order.controller.ts](../apps/api/src/modules/order/api/order.controller.ts)):
  `POST /orders/:id/reorder` (customer realm, ownership-checked like `getMineOne`).
- **Store BFF:** `/api/orders/[id]/reorder` proxy.
- **Store UI:** "Reorder" button on
  [orders/page.tsx](../apps/web-store/src/app/orders/page.tsx) and
  [orders/[id]/page.tsx](../apps/web-store/src/app/orders/[id]/page.tsx); on success route to
  `/cart` with a toast listing any dropped/unavailable items.

**Acceptance**
- Reorder repopulates the cart with available lines; unavailable items are reported, not
  silently dropped. Rx items still require a fresh prescription at checkout (unchanged).

**Effort:** ~2d.

---

## T3 — Prescription clarification ("needs info") loop

**Why:** Today a pharmacist can only **verify or reject**
([prescription.service.ts](../apps/api/src/modules/prescription/application/prescription.service.ts)).
Any ambiguous Rx becomes a hard rejection = lost order + frustrated patient. Comparators let
the pharmacy ask for a clearer photo / more info.

**Scope (additive — order state machine untouched)**
- **Contracts — enums** ([enums/index.ts](../packages/contracts/src/enums/index.ts)): add
  `RxStatus.NEEDS_INFO` (append only — persisted values stay stable) and a
  `VerificationDecision`-adjacent `requestInfo` action.
- **API — `PrescriptionService`:** `requestInfo(principal, id, { note })` → set status
  `NEEDS_INFO`, store the pharmacist note, audit it, notify the customer. Allow the customer
  to add files to an existing Rx (`addFiles(customerId, id, files)`), which re-enqueues the
  AV scan and moves status back to `PENDING`/`UNDER_REVIEW`. The linked order **stays**
  `AWAITING_RX_VERIFICATION`, so the order state machine doesn't change.
- **API controllers:** `POST /admin/prescriptions/:id/request-info` (rx:verify);
  `POST /prescriptions/:id/files` (customer, ownership-checked).
- **Admin UI** ([prescriptions/[id]/page.tsx](../apps/web-admin/src/app/prescriptions/[id]/page.tsx)):
  add a "Request more info" action with a note field alongside verify/reject.
- **Store UI** ([orders/[id]/page.tsx](../apps/web-store/src/app/orders/[id]/page.tsx) + a
  prescription view): show the pharmacist note and an "Upload a clearer photo" affordance.

**Acceptance**
- Pharmacist can request info with a note; customer is notified, uploads more files, and the
  Rx returns to the queue; the order is never wrongly rejected for a fixable issue.

**Effort:** ~3d. **Risk:** keep the enum change additive; AV-clean gate on verify stays enforced.

---

## T4 — Product image upload + rendering

**Why:** Cards render letter-placeholders. Against Jumia's image-dense grid this reads as
"not a real store."

**The good news:** `Product.images[]` already exists, storing **object-store keys** served via
signed/CDN URLs at read time ([catalog.schemas.ts:67](../apps/api/src/modules/catalog/infrastructure/catalog.schemas.ts)).
`StorageService` ([storage.service.ts](../apps/api/src/core/storage/storage.service.ts))
already does `putObject` + signed URLs.

**Scope**
- **API — admin upload:** `POST /admin/catalog/products/:id/images` (catalog:write) using the
  same `FilesInterceptor` + MIME/size pattern as prescriptions; store under
  `products/<id>/<uuid>.<ext>`; push the object key onto `images[]`. Add delete/reorder.
- **API — read-time URLs:** in `CatalogService.decorate()`
  ([catalog.service.ts](../apps/api/src/modules/catalog/application/catalog.service.ts)),
  map stored keys → signed GET URLs (or a public CDN prefix for a public product bucket —
  decide bucket policy; product images are **not** PHI, so a public-read CDN bucket is
  acceptable and cheaper than per-request signing).
- **Admin UI** ([products/page.tsx](../apps/web-admin/src/app/products/page.tsx)): image
  upload/preview/remove in the product editor.
- **Store UI:** `ProductCard`/product detail already render `images[0]` — no change needed
  once real URLs flow.

**Acceptance**
- Admin uploads an image; it appears on the storefront card and detail page; products without
  images keep the current placeholder.

**Effort:** ~2–3d. **Decision needed:** public product-image bucket+CDN vs. signed URLs.

---

## T5 — Surface existing trust signals (highest ROI)

**Why:** You already *capture* strong trust data; you just don't *show* it. Pure UI, no new
data model. Closes the gap with CVS/Amazon credibility cues.

**Scope**
- **Pharmacist verification on the order:** the verifying pharmacist + PCN# are stored on the
  prescription `verification` block and in the audit. Surface "Verified by a licensed
  pharmacist" (name/role; PCN optional) on a verified Rx order
  ([orders/[id]/page.tsx](../apps/web-store/src/app/orders/[id]/page.tsx)). May need the order
  read to include a verified-by summary (already on the prescription DTO).
- **Persistent support channel:** phone / WhatsApp / hours in the store header or footer
  ([layout.tsx](../apps/web-store/src/app/layout.tsx)) on every page.
- **Policy pages:** returns/refund policy + NDPA data-privacy page (marketing app already has
  the patterns: [web-marketing](../apps/web-marketing/src/app)); link them from checkout and
  footer.
- **Optional:** "X left at this branch" using the `available` value already returned by the
  catalog (also feeds T-conversion below).

**Acceptance**
- Verified-Rx orders show pharmacist assurance; support contact + policy links present on
  every storefront page and at checkout.

**Effort:** ~1–2d. **Risk:** confirm what's appropriate to surface (PCN number visibility) with compliance.

---

## T6 — Delivery ETA + address-aware fee surfacing

**Why:** You always quote `deliveryZones[0]` and show no ETA, so patients can't see the
"delivered today by 6pm" promise Capsule/Amazon lead with.

**The good news:** `deliveryZones` already carry `etaMins` (and `name`, `feeKobo`, `radiusKm`)
in [branch.schema.ts](../apps/api/src/modules/branch/infrastructure/branch.schema.ts) + seed.

**Scope (launch-pragmatic — keep manual dispatch)**
- **Contracts/DTO:** include `etaMins` and zone `name` in the quote/branch fulfilment DTO.
- **API — quote/order:** in `OrderService.quote()`/`createOrder()`
  ([order.service.ts](../apps/api/src/modules/order/application/order.service.ts)) return the
  selected zone's `etaMins`. For launch, a **per-zone picker** (customer selects their area)
  is acceptable; true geocoding-to-zone is post-MVP. Persist the chosen ETA on the order for
  display.
- **Store UI** ([checkout/page.tsx](../apps/web-store/src/app/checkout/page.tsx)): when
  "delivery" is selected, show the zone fee + "Estimated delivery: ~60 min / same day" from
  `etaMins`; show it again on the order tracking page.

**Acceptance**
- Delivery checkout shows a real fee + ETA tied to the chosen zone; pickup shows branch
  hours/readiness instead.

**Effort:** ~1–2d (per-zone picker). Full geocoded zone matching is **post-MVP**.

---

## Explicitly post-MVP (do not build now)

These are real roadmap items but should not contend with launch:
- Insurance / HMO claims (major epic; already deferred in the MVP doc).
- Auto-refill subscriptions + scheduled re-charge.
- Tele-consult / pharmacist chat.
- Family / dependent profiles; medication reminders & adherence nudges.
- Loyalty program (ExtraCare-style).
- Automated rider dispatch / live GPS; recommendations engine; multi-vendor marketplace.
- Abandoned-cart recovery automation and reorder reminders (infra exists; defer the triggers
  until notification deliverability + rate limiting are hardened per the readiness plan).

---

## How this slots into the launch plan

These ride **after** Phase 0–1 of [production-readiness.md](production-readiness.md) (the
security blockers must close first). T5 and T1 can begin in parallel with Phase 2 since they
don't touch the money/auth spine. Nothing here changes the order state machine, payment
settlement, or the RBAC model.
