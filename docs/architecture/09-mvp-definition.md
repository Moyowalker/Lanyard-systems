# 09 — MVP Definition

The MVP is a **contract with Product**: the smallest release that lets a real customer in
a real branch **buy real medicine (including prescription items) and pay**, while staff
**safely and lawfully fulfill** it. Everything else waits.

> Guiding rule: an MVP that can't verify a prescription or can't confirm a payment from a
> webhook is not viable for _this_ business. We cut breadth, never the safety/money spine.

---

## 1. MVP goal (one sentence)

> A customer can select a branch, browse the catalog, upload a prescription, place a
> pickup or delivery order, pay via Paystack, and track it — while a pharmacist verifies
> the prescription and staff manage inventory, orders, and fulfillment, with every
> sensitive action audited.

---

## 2. In scope (MVP)

### Platform Engine

- [x] Customer auth (phone + OTP), staff auth (email + password + **MFA**)
- [x] RBAC + branch-scoped authorization
- [x] Branch management (1–N branches), per-branch availability + pricing
- [x] Catalog (products, categories, regulatory class, search via text index)
- [x] Inventory (per-branch on-hand, reservations, manual receive/adjust, low-stock)
- [x] Prescription upload + AV scan + **pharmacist verification workflow**
- [x] Cart → checkout quote → order (state machine)
- [x] **Paystack** payment (init + **webhook verification** + reconciliation job)
- [x] Pickup **and** delivery (delivery = manual dispatch + status updates)
- [x] Order tracking + status history
- [x] Notifications: **SMS + email** (OTP, order updates, Rx verified/rejected)
- [x] Audit logging (immutable) on all sensitive actions
- [x] Background worker (AV scan, notifications, reconciliation)

### Customer Commerce (`web-store`)

- [x] Register/login (OTP), branch selection
- [x] Catalog browse, product detail, search
- [x] Prescription upload, cart, checkout (pickup/delivery)
- [x] Paystack payment, order confirmation + tracking
- [x] Profile, saved addresses, order history

### Staff Operations (`web-admin`)

- [x] Login + MFA, branch-scoped dashboard
- [x] **Prescription verification** screen (the regulatory core)
- [x] Order management + fulfillment + refunds
- [x] Product + category management, per-branch pricing
- [x] Inventory management (receive/adjust, low-stock view)
- [x] Customer lookup, staff/role management (admin), branch management (admin)
- [x] Read-only audit log viewer

### Marketing (`web-marketing`)

- [x] Homepage, About, Services, Branch locations, Contact, FAQ
- [x] Prescription-upload CTA + Shop CTA (handoff to store)
- [x] Basic SEO (metadata, sitemap, structured data) + analytics
- [x] Lead capture (contact form → `leads`)

---

## 3. Explicitly OUT of MVP (deliberately deferred)

| Deferred                                           | Why it can wait                                      |
| -------------------------------------------------- | ---------------------------------------------------- |
| **Flutterwave** (2nd provider)                     | Paystack covers launch; adapter already abstracts it |
| WhatsApp / push notifications                      | SMS+email sufficient at launch                       |
| Full **blog CMS**                                  | Static/seeded content first; CMS later               |
| Loyalty / coupons / referrals                      | Promotions engine basics only; growth feature later  |
| Automated delivery dispatch / rider app / live GPS | Manual dispatch + status updates suffice             |
| Advanced analytics / BI / data warehouse           | Operational dashboards + reports first               |
| Mobile app                                         | Architecture is ready; not built at launch           |
| Multi-currency / multi-country                     | NGN-only at launch                                   |
| Atlas Search / recommendation engine               | Mongo text search adequate initially                 |
| Insurance/HMO claims, EHR integration              | Major future epic, not launch                        |
| Self-service returns automation                    | Manual refund flow at launch                         |

Saying _no_ clearly here is what protects the timeline.

---

## 4. Definition of Done (MVP-wide)

A feature is done only when:

- DTOs in `contracts`, validated server-side; client uses generated `api-client`.
- AuthZ + branch scope enforced; sensitive actions audited.
- Unit + integration tests; critical flows covered by E2E.
- Idempotency on money/stock mutations.
- Errors mapped to canonical codes; user-facing messages friendly.
- Observability: logs/metrics/traces emitted; no PHI/secrets in logs.
- Accessible (WCAG AA on key flows) and responsive.
- Documented (API in OpenAPI; runbook notes where ops-relevant).

**Launch gates (must all pass):**

1. End-to-end Rx order works in staging with real provider **test** keys.
2. Payment webhook + reconciliation verified (incl. missed-webhook recovery).
3. Pharmacist verification cannot be bypassed; attempt is audited.
4. **Security review + penetration test** passed; secrets managed; backups + restore drill done.
5. Compliance sign-off: PCN premises/superintendent linkage, NDPA consent + retention, NAFDAC catalog metadata.

---

## 5. Suggested delivery phases

> Sequence, not fixed dates — calendar set with the team after staffing is known.

| Phase                       | Theme                                                                     | Outcome                                                   |
| --------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------- |
| **0. Foundations**          | Monorepo, CI/CD, auth, RBAC, branches, env/infra skeleton                 | Engineers productive; a user can log in; pipeline deploys |
| **1. Catalog & branch**     | Products, categories, per-branch price/availability, search, store browse | A customer can browse a branch catalog                    |
| **2. Rx & inventory**       | Rx upload + AV + verification workflow; inventory + reservations          | Pharmacists verify; stock is tracked                      |
| **3. Order & payment**      | Cart, checkout, order state machine, Paystack + webhooks, reconciliation  | A customer can buy and pay; staff fulfill                 |
| **4. Fulfillment & notify** | Pickup/delivery flows, tracking, SMS/email                                | Orders complete end-to-end with comms                     |
| **5. Marketing & polish**   | Marketing site, SEO, dashboards, reports, audit viewer                    | Public presence + ops visibility                          |
| **6. Hardening & launch**   | Security/pen test, load test, DR drill, compliance sign-off               | Production launch of one (or few) branches                |

Phases 1–4 can overlap once foundations land; the Rx + payment spine is the critical path.

---

## 6. MVP success metrics

- Completed Rx orders end-to-end (volume + conversion).
- Payment success rate; reconciliation discrepancies = 0.
- Median pharmacist Rx-verification turnaround (define SLA, e.g. < 30 min in hours).
- Inventory accuracy (system vs physical count) at a branch.
- Checkout completion rate; cart abandonment.
- Zero PHI/security incidents; audit completeness on sensitive actions.
