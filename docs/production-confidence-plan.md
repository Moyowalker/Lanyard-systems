# Production Confidence Plan — Lanyard Pharmacy

This plan turns the CTO readiness review into an implementation checklist for making
Lanyard Pharmacy provable, observable, compliant, and operationally calm before public
launch.

Use it as a delivery guide, client-facing readiness reference, and ticket source for
engineering, operations, and compliance.

## Goal

Lanyard Pharmacy should be:

- **Provable** — every critical claim can be demonstrated with tests, logs, screenshots,
  audit records, staging evidence, or operational reports.
- **Observable** — when something breaks, the team knows quickly, knows where, and knows
  which customer, order, payment, prescription, or staff action was affected.
- **Compliant** — pharmacy, payment, PHI, NDPA, PCN, and NAFDAC controls are enforced by
  workflow, not only by policy.
- **Operationally calm** — pharmacists and staff can run the business without panic,
  guesswork, or hidden system behavior.

## Phase 1 — Production Evidence Pack

Create a launch evidence pack that proves the platform works and is controlled.

### Checklist

- [ ] Create a shared `Lanyard Pharmacy Production Evidence` folder.
- [ ] Add screenshots of the customer order flow.
- [ ] Add screenshots of pharmacist prescription verification.
- [ ] Add screenshots of admin order fulfilment.
- [ ] Add the Swagger/OpenAPI docs link.
- [ ] Add CI validation results.
- [ ] Add payment webhook test evidence.
- [ ] Add audit log examples for sensitive actions.
- [ ] Add backup and restore drill proof.
- [ ] Add the compliance sign-off checklist.

### How to achieve it

For every launch-critical flow, store evidence with date, owner, environment, and result.
At minimum, capture evidence for customer checkout, prescription upload, pharmacist
verification, payment settlement, PHI access audit, refund handling, and MongoDB restore.

### Client value

Clients and investors should not only hear that the system works. They should see proof
that the team can operate, audit, and recover the platform.

## Phase 2 — Real Provider Readiness

Do not launch with mock or unverified provider behavior.

### Checklist

- [ ] Provision MongoDB Atlas production or staging cluster.
- [ ] Enable automated backups.
- [ ] Enable point-in-time recovery.
- [ ] Run and document a restore drill.
- [ ] Add Paystack credentials.
- [ ] Configure the Paystack webhook URL.
- [ ] Add Termii SMS credentials.
- [ ] Add SMTP/email credentials.
- [ ] Add S3-compatible storage credentials.
- [ ] Confirm the API boots in `NODE_ENV=production`.
- [ ] Confirm the dev payment-confirm route returns `404`.
- [ ] Confirm OTP responses do not expose `devCode` in production.

### How to achieve it

Use [render.yaml](../render.yaml) as the deployment baseline, then manually verify that
the live Render services match the file. Run the staging payment checklist in
[staging-payment-checklist.md](staging-payment-checklist.md) before any real traffic.

### Minimum proof required

- Render environment variables present, without exposing secret values.
- Paystack webhook configured.
- Test order paid through Paystack.
- Webhook received and order marked paid.
- Duplicate webhook handled safely.
- MongoDB restore drill documented with date, owner, recovery time, and result.

## Phase 3 — Staff Security Hardening

Staff security must match the sensitivity of PHI, refunds, branch operations, and catalog
control.

### Checklist

- [ ] Enforce MFA for all staff.
- [ ] Add MFA enrollment flow.
- [ ] Remove plaintext TOTP secret storage.
- [ ] Rotate seeded or default staff passwords.
- [ ] Add staff login lockout.
- [ ] Add step-up MFA for refunds.
- [ ] Add step-up MFA for PHI access.
- [ ] Add staff session and device visibility.
- [ ] Add admin action audit trail visibility.

### How to achieve it

Make MFA mandatory for staff accounts. Store MFA secrets with a secrets manager or strong
encryption-at-rest approach. Require step-up verification for high-risk actions such as
PHI access, refund approval, staff management, branch activation, and controlled product
changes.

### Client value

The client should be able to say: every privileged staff action is tied to a named staff
identity, branch scope, MFA posture, and audit trail.

## Phase 4 — Compliance Enforcement

Move compliance from manual intention into system-enforced gates.

### Checklist

- [ ] Capture explicit PHI-processing consent.
- [ ] Version privacy and consent text.
- [ ] Block prescription upload without PHI consent.
- [ ] Block active branch status without a valid PCN premises number.
- [ ] Block active branch status without a valid superintendent pharmacist.
- [ ] Enforce superintendent `isSuperintendent = true`.
- [ ] Enforce superintendent license expiry is in the future.
- [ ] Add license-expiry alerts.
- [ ] Require NAFDAC registration number for regulated medicines.
- [ ] Require manufacturer for regulated medicines.
- [ ] Block product publishing if regulatory metadata is incomplete.
- [ ] Create a data-subject request runbook.
- [ ] Create retention, deletion, and legal-hold runbooks.

### How to achieve it

Use [architecture/12-compliance-readiness.md](architecture/12-compliance-readiness.md) as
the source checklist. Add service-level validation and admin UI status indicators for PCN,
superintendent, PHI consent, and catalog regulatory completeness.

### Client value

Show compliance status directly in admin workflows with clear badges such as `PCN
verified`, `Superintendent valid`, `NAFDAC complete`, `PHI consent captured`, and
`Audit-ready`.

## Phase 5 — Observability and Alerting

The team should detect failures before customers, pharmacists, or finance teams escalate
them manually.

### Checklist

- [ ] Add structured JSON logs.
- [ ] Generate correlation/request IDs.
- [ ] Add Sentry or equivalent error tracking.
- [ ] Add uptime monitoring.
- [ ] Add payment failure alerts.
- [ ] Add webhook failure alerts.
- [ ] Add queue backlog alerts.
- [ ] Add failed OTP/SMS delivery alerts.
- [ ] Add failed email alerts.
- [ ] Add low-stock alerts.
- [ ] Add stuck order alerts.
- [ ] Add stuck prescription review alerts.
- [ ] Add failed refund alerts.
- [ ] Add an internal system health dashboard.

### How to achieve it

Start with practical tools: Sentry for exceptions, structured app logs, uptime checks, and
a simple internal health page showing API, MongoDB, Redis, S3, SMS, SMTP, Paystack, and
worker status.

### Critical alerts

- Payment intent pending too long.
- Paystack webhook rejected.
- Prescription pending review beyond SLA.
- Order paid but not reserved or fulfilled.
- OTP/SMS failures spike.
- Worker queue has failed or delayed jobs.
- Redis, MongoDB, S3, SMTP, or Paystack unavailable.

## Phase 6 — Money and Stock Integrity

Payment and inventory must behave like accounting systems, not ordinary CRUD workflows.

### Checklist

- [ ] Add idempotency to order creation.
- [ ] Add idempotency to payment initiation.
- [ ] Verify duplicate webhook safety.
- [ ] Schedule payment reconciliation on the worker.
- [ ] Fix refund saga consistency risk.
- [ ] Use the outbox pattern for money and stock side effects.
- [ ] Load test concurrent checkout.
- [ ] Prove zero overselling under concurrency.
- [ ] Add stock movement audit trail to admin.
- [ ] Add a daily payment reconciliation report.

### How to achieve it

Every money or stock mutation should have idempotency, auditability, and recovery logic.
The system should prove that one payment settles one order, duplicate webhooks do not
double-settle, refunds cannot leave order state inconsistent, and stock cannot be oversold
during concurrent checkout.

## Phase 7 — CI/CD Quality Gates

CI should prove the business-critical flows, not only that TypeScript compiles.

### Checklist

- [ ] Keep build in CI.
- [ ] Keep typecheck in CI.
- [ ] Keep unit tests in CI.
- [ ] Keep format check in CI.
- [ ] Add API integration tests in CI.
- [ ] Add Playwright E2E tests in CI.
- [ ] Add dependency scanning.
- [ ] Add secret scanning.
- [ ] Add linting.
- [ ] Add production build smoke test.
- [ ] Add migration/seed smoke test for staging.
- [ ] Block merge if critical checks fail.

### How to achieve it

Update [.github/workflows/ci.yml](../.github/workflows/ci.yml) to run critical integration
and E2E flows with ephemeral MongoDB and Redis services. The merge gate should prove
customer auth, staff auth, cart, checkout, payment settlement, prescription verification,
and branch-scoped admin access.

## Phase 8 — Customer UX Trust Upgrade

The storefront should reduce uncertainty at every healthcare decision point.

### Checklist

- [ ] Fix visible branch text/data defects such as malformed branch names.
- [ ] Show real support phone, WhatsApp, and support hours.
- [ ] Show prescription review expectations.
- [ ] Show clear delivery ETA and fee logic.
- [ ] Show NAFDAC and manufacturer data on product pages.
- [ ] Show pharmacist verification language on prescription orders.
- [ ] Improve the unauthenticated checkout screen.
- [ ] Add intentional empty, error, and loading states.
- [ ] Add order timeline with human-readable statuses.
- [ ] Add a clear `what happens next` state after checkout.
- [ ] Add failed payment recovery path.
- [ ] Add rejected prescription recovery path.

### How to achieve it

Rewrite customer UX around the questions customers actually have: which branch is
fulfilling, whether a product requires a prescription, who verifies it, when it will be
ready, who to contact, and what happens if payment or prescription review fails.

## Phase 9 — Pharmacist and Staff Operations Upgrade

The admin console should feel like a pharmacy command center, not a generic dashboard.

### Checklist

- [ ] Add prescription SLA indicators.
- [ ] Sort prescription queue by urgency and age.
- [ ] Show patient and order context during prescription review.
- [ ] Show pharmacist decision history.
- [ ] Show request-more-information workflow evidence.
- [ ] Add refund warnings and audit preview.
- [ ] Show branch scope visibility everywhere.
- [ ] Add low-stock operational dashboard.
- [ ] Add stuck order dashboard.
- [ ] Add a daily operations checklist.

### How to achieve it

Design staff workflows around daily operating questions: which prescriptions need review,
which paid orders are waiting, which orders are blocked, which stock is low, which refunds
need attention, and which compliance items require action.

## Phase 10 — Runbooks and Operating Model

Runbooks make incidents calmer and reduce dependence on tribal knowledge.

### Checklist

- [ ] Payment failure runbook.
- [ ] Missed webhook runbook.
- [ ] Refund dispute runbook.
- [ ] SMS provider outage runbook.
- [ ] Email provider outage runbook.
- [ ] S3/file upload failure runbook.
- [ ] Prescription escalation runbook.
- [ ] PHI incident/breach runbook.
- [ ] Staff account compromise runbook.
- [ ] MongoDB restore runbook.
- [ ] Deploy rollback runbook.
- [ ] Daily launch monitoring checklist.

### How to achieve it

Each runbook should answer:

- What happened?
- How do we detect it?
- Who owns it?
- What is the immediate action?
- What customer or staff message should be sent?
- What must be audited?
- How do we confirm recovery?

## Owner Actions

The platform owner should:

- [ ] Set the launch standard: launch only when the system is provable, observable,
      compliant, and operationally calm.
- [ ] Create and maintain the launch evidence pack.
- [ ] Assign engineering, operations, and compliance owners for every checklist item.
- [ ] Require evidence for completion, not only verbal status updates.
- [ ] Limit launch to one or two branches.
- [ ] Limit launch catalog to verified products.
- [ ] Use manual delivery dispatch until volume justifies automation.
- [ ] Run daily launch readiness reviews during the final pre-launch window.
- [ ] Reject distracting features until the prescription, payment, and fulfilment spine is
      proven.

## Client-Impressing Deliverables

Prepare these before the next serious stakeholder review:

- [ ] Production readiness scorecard.
- [ ] Compliance evidence pack.
- [ ] Staging payment test report.
- [ ] Pharmacist workflow demo.
- [ ] Customer order demo.
- [ ] Admin operations demo.
- [ ] Monitoring dashboard screenshot.
- [ ] Backup and restore drill report.
- [ ] Launch risk register.
- [ ] 30-day post-launch operating plan.

## Final Launch Gate

Do not launch until all of these are true:

- [ ] Real providers configured and tested.
- [ ] Staff MFA enforced.
- [ ] AV scanning is real.
- [ ] MongoDB backups and point-in-time recovery are proven.
- [ ] PHI consent is captured and versioned.
- [ ] PCN and superintendent enforcement is implemented.
- [ ] NAFDAC product publish gates are implemented.
- [ ] Payment webhook and reconciliation are proven.
- [ ] Refund consistency risk is fixed.
- [ ] Observability is live.
- [ ] Integration and E2E CI gates are running.
- [ ] Runbooks are written.
- [ ] One-branch launch plan is approved.

## Positioning Statement

The platform already has strong product and architecture foundations. This plan is how it
becomes more than a polished custom build: a healthcare technology platform that can prove
its controls, detect failure, satisfy compliance review, and operate calmly under real
pharmacy conditions.# Production Confidence Plan — Lanyard Pharmacy

This plan turns the CTO readiness review into an implementation checklist for making
Lanyard Pharmacy provable, observable, compliant, and operationally calm before public
launch.

It should be used alongside:

- [Production Readiness Checklist](production-readiness.md)
- [Pre-launch Feature Backlog](pre-launch-feature-backlog.md)
- [Staging Payment Checklist](staging-payment-checklist.md)
- [Compliance Readiness Checklist](architecture/12-compliance-readiness.md)
- [MVP Definition](architecture/09-mvp-definition.md)

## Goal

Lanyard Pharmacy should be able to prove that it can safely support real customers,
real prescriptions, real pharmacy staff, and real payments.

The launch standard is:

- **Provable:** every critical claim has evidence: tests, logs, screenshots, audit records,
  staging runs, or signed operational checklists.
- **Observable:** failures are detected quickly, tied to a request/order/payment/Rx context,
  and routed to the right owner.
- **Compliant:** pharmacy, payment, PHI, NDPA, PCN, and NAFDAC controls are enforced by
  workflow and backed by evidence.
- **Operationally calm:** pharmacists and staff can run the business without panic,
  guesswork, or hidden system behavior.

## Phase 1 — Production Evidence Pack

Create a client- and investor-ready evidence pack before any public launch decision.

### Checklist

- [ ] Create a `Lanyard Pharmacy Production Evidence` folder or workspace.
- [ ] Add screenshots of the customer browse, cart, checkout, and order-tracking flow.
- [ ] Add screenshots of pharmacist prescription verification.
- [ ] Add screenshots of admin order fulfillment.
- [ ] Add Swagger/API documentation links.
- [ ] Add CI validation results.
- [ ] Add payment webhook test evidence.
- [ ] Add audit log examples for PHI access and sensitive actions.
- [ ] Add MongoDB backup and restore-drill proof.
- [ ] Add compliance sign-off checklist.

### How to Achieve It

For each launch-critical workflow, capture evidence that a non-engineer can inspect:

- Customer places an OTC order.
- Customer places an Rx order.
- Pharmacist verifies, rejects, or requests more information for a prescription.
- Paystack webhook settles payment.
- Duplicate webhook is handled safely.
- Staff views PHI and the access is audited.
- Backup restore drill completes successfully.

Each evidence item should include the date, environment, owner, result, and link to the
supporting screenshot, log, or report.

## Phase 2 — Real Provider Readiness

This phase blocks real prescriptions, real customers, and real money.

### Checklist

- [ ] Provision MongoDB Atlas production/staging cluster.
- [ ] Enable automated backups.
- [ ] Enable point-in-time recovery.
- [ ] Run and document one restore drill.
- [ ] Add Paystack test/live credentials.
- [ ] Configure Paystack webhook URL.
- [ ] Add Termii SMS credentials.
- [ ] Add SMTP/email credentials.
- [ ] Add S3-compatible storage credentials.
- [ ] Confirm API boots in `NODE_ENV=production`.
- [ ] Confirm the dev payment-confirm route returns 404.
- [ ] Confirm OTP responses do not expose `devCode`.

### How to Achieve It

Use [../render.yaml](../render.yaml) as the infrastructure starting point, but manually
verify the live Render environment. The file is not proof that the deployed services are
configured correctly.

Minimum evidence:

- Render services synced from the blueprint.
- Required env vars present in Render without exposing secret values.
- Paystack webhook configured and reachable.
- Test order paid through Paystack.
- Webhook received and order marked paid.
- Duplicate webhook returns a duplicate-safe response.
- MongoDB restore drill completed and documented.

## Phase 3 — Staff Security Hardening

Staff security is a healthcare trust issue, not only an engineering task.

### Checklist

- [ ] Enforce MFA for all staff.
- [ ] Add MFA enrollment flow.
- [ ] Remove plaintext TOTP secret storage.
- [ ] Rotate seeded/default staff passwords.
- [ ] Add staff login lockout.
- [ ] Add step-up MFA for refunds.
- [ ] Add step-up MFA for PHI access.
- [ ] Add staff session/device visibility.
- [ ] Display admin action audit trails in the operations console.

### How to Achieve It

Turn staff MFA from a design promise into a hard requirement. Any staff role that can view
prescriptions, approve refunds, manage staff, alter branch data, or alter product data
should require MFA.

TOTP secrets should be stored through a secrets manager or encrypted-at-rest secret field,
not as raw application data. The seed superintendent password should be rotated before any
shared staging or production review.

Client-facing proof statement:

> Every privileged staff action is tied to a named staff identity, branch scope, MFA
> posture, and audit trail.

## Phase 4 — Compliance Enforcement

Compliance must move from manual review into system-enforced gates wherever possible.

### Checklist

- [ ] Capture explicit PHI-processing consent.
- [ ] Version privacy and consent text.
- [ ] Block prescription upload without PHI consent.
- [ ] Block active branches without a valid PCN premises number.
- [ ] Block active branches without a valid superintendent pharmacist.
- [ ] Enforce `pharmacist.isSuperintendent = true` for branch superintendent linkage.
- [ ] Enforce superintendent license expiry is in the future.
- [ ] Add license-expiry alerts.
- [ ] Require NAFDAC registration number for regulated medicines.
- [ ] Require manufacturer for regulated medicines.
- [ ] Block product publishing if regulatory metadata is incomplete.
- [ ] Create data-subject request runbook.
- [ ] Create retention, deletion, and legal-hold runbook.

### How to Achieve It

Use [architecture/12-compliance-readiness.md](architecture/12-compliance-readiness.md) as
the source checklist.

Implementation examples:

- Branch activation should fail unless PCN and superintendent checks pass.
- Regulated products should not appear in the storefront unless NAFDAC and manufacturer
  data exists.
- Prescription upload should require explicit PHI consent with policy version and timestamp.
- Admin screens should show compliance status badges such as `PCN verified`,
  `Superintendent valid`, `NAFDAC complete`, `PHI consent captured`, and `Audit-ready`.

## Phase 5 — Observability and Alerting

Operations becomes calm when failures are visible and actionable.

### Checklist

- [ ] Add structured JSON logs.
- [ ] Generate correlation/request IDs.
- [ ] Add Sentry or equivalent error tracking.
- [ ] Add uptime monitoring.
- [ ] Add payment failure alerts.
- [ ] Add webhook failure alerts.
- [ ] Add queue backlog alerts.
- [ ] Add failed OTP/SMS delivery alerts.
- [ ] Add failed email alerts.
- [ ] Add low-stock alerts.
- [ ] Add stuck order alerts.
- [ ] Add stuck prescription-review alerts.
- [ ] Add failed refund alerts.
- [ ] Add an internal system health dashboard.

### How to Achieve It

Start simple and focus on the signals that match the business risk:

- Sentry for frontend and backend exceptions.
- Structured backend logs with request IDs and PII/PHI scrubbing.
- Uptime checks for `/api/v1/health/live` and `/api/v1/health/ready`.
- An internal health page for API, MongoDB, Redis, S3, SMS, SMTP, Paystack, and worker queue.

Important alerts:

- Payment intent pending too long.
- Paystack webhook rejected.
- Prescription pending review beyond SLA.
- Order paid but not reserved or fulfilled.
- SMS OTP failures spike.
- Worker queue has failed jobs.
- Redis unavailable.
- MongoDB unavailable.
- S3 upload or signed-download failure.

## Phase 6 — Money and Stock Integrity

Payment and inventory should be treated like accounting systems, not normal CRUD.

### Checklist

- [ ] Add idempotency to order creation.
- [ ] Add idempotency to payment initiation.
- [ ] Verify duplicate webhook safety.
- [ ] Schedule payment reconciliation job.
- [ ] Fix refund saga risk.
- [ ] Use the outbox pattern for money and stock side effects.
- [ ] Load test concurrent checkout.
- [ ] Prove zero overselling under concurrency.
- [ ] Add stock movement audit trail to admin.
- [ ] Add daily payment reconciliation report.

### How to Achieve It

The system should prove these invariants:

- One payment settles one order.
- Duplicate webhooks do not double-settle.
- Refund success cannot leave the order in the wrong state.
- Stock cannot be oversold during concurrent checkout.
- Every stock movement has a reason, actor, branch, and timestamp.

For client confidence, position this as payment reconciliation and stock integrity controls,
not just backend implementation detail.

## Phase 7 — CI/CD Quality Gates

CI should prove the business-critical flows, not only the TypeScript build.

### Checklist

- [ ] Keep build in CI.
- [ ] Keep typecheck in CI.
- [ ] Keep unit tests in CI.
- [ ] Keep format check in CI.
- [ ] Add API integration tests in CI.
- [ ] Add Playwright E2E tests in CI.
- [ ] Add dependency scanning.
- [ ] Add secret scanning.
- [ ] Add linting.
- [ ] Add production build smoke test.
- [ ] Add migration/seed smoke test for staging.
- [ ] Block merge if critical checks fail.

### How to Achieve It

Update [../.github/workflows/ci.yml](../.github/workflows/ci.yml) so the checks match
the platform's actual launch risks. Use ephemeral MongoDB and Redis services for API
integration tests. Run Playwright against seeded local apps.

Release proof should cover:

- Customer OTP flow.
- Anonymous cart and merge-on-login.
- Prescription upload and pharmacist verification.
- Checkout and payment webhook settlement.
- Admin login and branch-scoped operations.
- Refund and reconciliation paths.

## Phase 8 — Customer UX Trust Upgrade

The storefront should reduce uncertainty at every step.

### Checklist

- [ ] Fix branch text/data issues such as malformed branch names.
- [ ] Show real support phone, WhatsApp, and hours.
- [ ] Show prescription-review expectations.
- [ ] Show clear delivery ETA and fee logic.
- [ ] Show NAFDAC and manufacturer data on product pages.
- [ ] Show pharmacist verification language on Rx orders.
- [ ] Improve unauthenticated checkout screen.
- [ ] Add intentional empty, error, and loading states.
- [ ] Add order timeline with human-readable statuses.
- [ ] Add `what happens next` guidance after checkout.
- [ ] Add failed-payment recovery path.
- [ ] Add rejected-Rx recovery path.

### How to Achieve It

Rewrite key customer flows around uncertainty:

- Which branch is fulfilling the order?
- Does this product need a prescription?
- Who verifies it?
- How long will review and fulfillment take?
- Who should the customer contact if stuck?
- What happens if payment succeeds but order status does not update immediately?

## Phase 9 — Pharmacist and Staff Operations Upgrade

The operations console should feel like a pharmacy command center.

### Checklist

- [ ] Add prescription SLA indicators.
- [ ] Sort Rx queue by urgency and age.
- [ ] Show patient/order context during Rx review.
- [ ] Show pharmacist decision history.
- [ ] Add visible evidence for the request-more-information workflow.
- [ ] Add refund warnings and audit preview.
- [ ] Add branch scope visibility everywhere.
- [ ] Add low-stock operational dashboard.
- [ ] Add stuck-order dashboard.
- [ ] Add daily operations checklist.

### How to Achieve It

Each staff user should start the day knowing:

- Which prescriptions need review.
- Which orders are paid and waiting.
- Which orders are blocked.
- Which stock is low.
- Which payments or refunds need attention.
- Which compliance items need action.

## Phase 10 — Runbooks and Operating Model

Runbooks make incidents survivable and reduce operational anxiety.

### Checklist

- [ ] Payment failure runbook.
- [ ] Missed webhook runbook.
- [ ] Refund dispute runbook.
- [ ] SMS provider outage runbook.
- [ ] Email provider outage runbook.
- [ ] S3/file upload failure runbook.
- [ ] Prescription escalation runbook.
- [ ] PHI incident/breach runbook.
- [ ] Staff account compromise runbook.
- [ ] MongoDB restore runbook.
- [ ] Deploy rollback runbook.
- [ ] Daily launch monitoring checklist.

### How to Achieve It

Each runbook should answer:

- What happened?
- How do we detect it?
- Who owns it?
- What is the immediate action?
- What customer or staff message should be sent?
- What must be audited?
- How do we confirm recovery?

Runbooks should exist before launch. They are cheap before incidents and expensive during
incidents.

## Founder and Delivery Owner Actions

The founder/delivery owner should personally own the launch standard.

### Checklist

- [ ] Make `provable, observable, compliant, and operationally calm` the launch rule.
- [ ] Create and maintain the production evidence pack.
- [ ] Assign named owners for each checklist item.
- [ ] Attach due dates and evidence requirements to each item.
- [ ] Limit launch to one or two branches.
- [ ] Limit launch catalog to verified products.
- [ ] Keep delivery dispatch manual until volume justifies automation.
- [ ] Run daily launch-readiness reviews during the final launch window.
- [ ] Reject distracting features until the Rx/payment/fulfillment spine is proven.

### Features to Defer

Do not prioritize these until launch controls are stable:

- Loyalty.
- Coupons.
- Mobile app.
- Advanced analytics.
- Recommendation engine.
- Second payment provider.
- Rider app or live GPS dispatch.
- Large catalog expansion without regulatory QA.

## Client-Impressing Deliverables

Prepare these before the next serious stakeholder review:

- [ ] Production Readiness Scorecard.
- [ ] Compliance Evidence Pack.
- [ ] Staging Payment Test Report.
- [ ] Pharmacist Workflow Demo.
- [ ] Customer Order Demo.
- [ ] Admin Operations Demo.
- [ ] Monitoring Dashboard Screenshot.
- [ ] Backup/Restore Drill Report.
- [ ] Launch Risk Register.
- [ ] 30-Day Post-Launch Operating Plan.

## Final Launch Gate

Do not launch until these are true:

- [ ] Real providers configured and tested.
- [ ] Staff MFA enforced.
- [ ] AV scanning is real.
- [ ] MongoDB backups and point-in-time recovery are proven.
- [ ] PHI consent is captured.
- [ ] PCN/superintendent enforcement is implemented.
- [ ] NAFDAC publish gates are implemented.
- [ ] Payment webhook and reconciliation are proven.
- [ ] Refund consistency is fixed.
- [ ] Observability is live.
- [ ] Integration and E2E CI are running.
- [ ] Runbooks are written.
- [ ] One-branch launch plan is approved.

## Working Principle

The platform should not launch because the UI looks ready. It should launch when the
system can prove safe dispensing, reliable payments, protected PHI, recoverable data,
visible failures, and calm pharmacy operations.
