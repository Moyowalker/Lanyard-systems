# 10 — Engineering Risks & Mitigation Plan

Risks scored on **Likelihood (L)** and **Impact (I)**, each Low/Med/High. Mitigations are
architectural commitments, not aspirations — most are already reflected in docs 01–09.

---

## 1. Risk register

### Regulatory & compliance

| ID  | Risk                                                                                   | L   | I        | Mitigation                                                                                                                                                                               |
| --- | -------------------------------------------------------------------------------------- | --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **Dispensing POM without valid pharmacist verification** (PCN violation, patient harm) | M   | **High** | Hard state-machine gate: Rx items cannot pass `AWAITING_RX_VERIFICATION` without a verified pharmacist action; `rx:verify` requires a valid in-date PCN license; every decision audited. |
| R2  | **PHI breach / improper access** (NDPA)                                                | M   | **High** | PHI in encrypted object store; signed short-lived URLs; `phi:view` permission gated + audited; least privilege; pen test; breach runbook.                                                |
| R3  | Selling unregistered/controlled products improperly                                    | L   | High     | Catalog `regulatoryClass`/`nafdacRegNo`/`isControlled`; controlled items restricted; publish workflow.                                                                                   |
| R4  | Branch operating without licensed superintendent                                       | L   | High     | Branch cannot be `active` without linked in-date superintendent pharmacist; license-expiry alerts.                                                                                       |
| R5  | Missing data-subject rights / consent                                                  | M   | Med      | Consent captured + versioned; access/deletion flows; retention policy + legal holds.                                                                                                     |

### Payments & money integrity

| ID  | Risk                                                            | L   | I        | Mitigation                                                                                   |
| --- | --------------------------------------------------------------- | --- | -------- | -------------------------------------------------------------------------------------------- |
| R6  | **Trusting client-side payment "success"** → unpaid fulfillment | M   | **High** | Payment state changes **only** from signature-verified webhooks; client redirect is UX only. |
| R7  | Double charge / duplicate orders                                | M   | High     | Idempotency keys on order-create + payment-init; webhook dedupe by provider event id.        |
| R8  | Missed/lost webhooks → stuck orders                             | M   | Med      | Reconciliation job polls `verify()` for pending intents; alerting on backlog.                |
| R9  | Refund/chargeback abuse, fraud                                  | M   | Med      | Refunds permissioned + audited (step-up MFA); amount/currency match checks; monitoring.      |
| R10 | Money rounding/float errors                                     | L   | High     | Integer minor units (kobo) everywhere; no floats.                                            |

### Data & consistency

| ID  | Risk                                           | L   | I    | Mitigation                                                                                            |
| --- | ---------------------------------------------- | --- | ---- | ----------------------------------------------------------------------------------------------------- |
| R11 | **Overselling stock** across concurrent orders | M   | High | Reservation model + Mongo transactions at PAID; available = onHand − reserved; stock movement ledger. |
| R12 | Inventory drift (system vs physical)           | M   | Med  | Append-only stock movements; periodic reconciliation/cycle counts; adjustment audit.                  |
| R13 | Lost domain events on crash                    | L   | Med  | Transactional **outbox** + worker publisher; at-least-once + idempotent consumers.                    |
| R14 | Schema drift / undisciplined Mongo documents   | M   | Med  | Mongoose schemas + zod validation; versioned migrations; CI contract checks.                          |
| R15 | Historical orders mutated by catalog changes   | M   | Med  | Price/name **snapshots** embedded on order at creation.                                               |

### Security

| ID  | Risk                                       | L   | I    | Mitigation                                                                                                                     |
| --- | ------------------------------------------ | --- | ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| R16 | Privilege escalation / cross-branch access | M   | High | Separate realms (`aud`); permission + branch-scope guards using **resource** branchId; DB re-validation for high-risk actions. |
| R17 | Token theft / XSS                          | M   | High | httpOnly cookies, CSP, short access TTL, rotating refresh w/ reuse detection.                                                  |
| R18 | Malicious file upload (Rx)                 | M   | Med  | Type/size validation, AV scan before use, private bucket, no execution path.                                                   |
| R19 | Brute force / OTP & SMS-pumping abuse      | M   | Med  | Rate limiting per IP+user, OTP attempt lockout, WAF, uniform responses.                                                        |
| R20 | Secret leakage                             | L   | High | Secrets manager, secret scanning in CI, no secrets in images/logs.                                                             |
| R21 | Dependency/supply-chain vulns              | M   | Med  | CI dependency audit + image scanning; patch cadence; pinned versions.                                                          |

### Operational & infrastructure

| ID  | Risk                                | L   | I        | Mitigation                                                                                                 |
| --- | ----------------------------------- | --- | -------- | ---------------------------------------------------------------------------------------------------------- |
| R22 | **Provider outage** (Paystack/SMS)  | M   | Med      | Provider abstraction; queue + retry; graceful UX; Flutterwave ready as fallback.                           |
| R23 | Data loss                           | L   | **High** | Managed backups + PITR; object versioning; **tested** restore drills.                                      |
| R24 | Latency for Nigerian users          | M   | Med      | CDN edge, low-latency region, lean bundles, caching, optimistic UI.                                        |
| R25 | Poor connectivity / failed requests | M   | Med      | Retry/backoff in api-client, idempotency so retries are safe, clear offline UX.                            |
| R26 | No visibility into prod issues      | M   | Med      | Logs/metrics/traces/Sentry + uptime + business alerts from day one.                                        |
| R27 | Bad deploy breaks prod              | M   | Med      | Staging parity, smoke/E2E gate, rolling health-checked deploys, auto-rollback, expand/contract migrations. |

### Product & delivery

| ID  | Risk                                     | L        | I    | Mitigation                                                                         |
| --- | ---------------------------------------- | -------- | ---- | ---------------------------------------------------------------------------------- |
| R28 | **Scope creep** (4 systems at once)      | **High** | High | MVP contract (doc 09); explicit out-of-scope list; phased delivery; spine-first.   |
| R29 | Microservices/over-engineering too early | M        | Med  | Modular monolith now; documented extraction path; resist premature distribution.   |
| R30 | Multi-branch complexity underestimated   | M        | Med  | Branch-first from day one (not retrofitted); branch scope in schema, authz, tests. |
| R31 | Small team / bus factor                  | M        | Med  | Monorepo, shared contracts, docs/ADRs, conventional commits, tests as living spec. |
| R32 | Low launch adoption                      | M        | Med  | Launch one/few branches; marketing site + SEO; measure funnels; iterate.           |
| R33 | Delivery logistics immature              | M        | Med  | MVP manual dispatch; defer rider app/automation until volume justifies.            |

---

## 2. Top 5 risks to watch (executive view)

1. **R1 — Unverified Rx dispensing.** Patient-safety + legal. Architecturally hard-gated;
   treat any bypass as a Sev-1.
2. **R6 — Client-trusted payments.** Webhook-only truth + reconciliation; never relax this.
3. **R2 — PHI breach.** Encryption, signed URLs, audited access, least privilege, pen test.
4. **R11 — Overselling.** Reservation + transactions + ledger; load-test concurrency.
5. **R28 — Scope creep.** The MVP contract is the primary schedule defense.

---

## 3. Pre-launch readiness checklist

**Security & compliance**

- [ ] Penetration test passed; criticals/highs remediated
- [ ] Secrets in manager; secret scanning green; no secrets in images/logs
- [ ] PHI encryption (rest + transit) verified; signed-URL access audited
- [ ] NDPA: consent capture, retention policy, data-subject request flow
- [ ] PCN: premises + superintendent linkage enforced; pharmacist licenses validated
- [ ] NAFDAC: catalog regulatory metadata reviewed; controlled-item handling confirmed

**Money & data**

- [ ] Payment webhook + reconciliation verified incl. missed-webhook recovery
- [ ] Idempotency verified on order-create + payment-init (replay-safe)
- [ ] Overselling load test under concurrency = 0 oversell
- [ ] Backups + **restore drill** completed; RPO/RTO documented

**Operations**

- [ ] Observability live (logs/metrics/traces/Sentry/uptime/business alerts)
- [ ] Health checks + rolling deploy + auto-rollback verified
- [ ] Runbooks: payment failures, provider outage, stuck orders, incident/breach response
- [ ] On-call / escalation path defined

**Product**

- [ ] Full Rx order E2E in staging (pickup + delivery)
- [ ] Pharmacist verification cannot be bypassed (negative test + audit)
- [ ] Accessibility (WCAG AA) on key flows; responsive on low-end devices
- [ ] Single-branch (or limited) launch plan + rollback/communication plan

---

## 4. Change control

Material architectural changes are recorded as **ADRs** appended to the relevant doc
(context → decision → consequences → date). The risk register is reviewed at each phase
gate and before launch.
