# Production Readiness Checklist — Lanyard Pharmacy

**Status: NOT production-ready.** This branch now closes several repo-controlled P0s,
but the live Render environment still needs to be synced, provisioned, and smoke-tested.
The remaining blocker list below must be fully closed before any real customer, real
prescription, or real money touches the system.

> Validated against the codebase on 2026-06-12. Each item cites the file that is the
> source of truth. Severity legend: **P0** = launch blocker, **P1** = high, **P2** =
> medium, **P3** = nice-to-have.

---

## 1. Readiness scoreboard

| Area                  | State                                                              | Worst severity |
| --------------------- | ------------------------------------------------------------------ | -------------- |
| Environment variables | ⚠️ Blueprint now production; provider secrets pending              | **P0**         |
| Secrets management    | ⚠️ JWT auto-gen OK; MFA secret stored plaintext                    | **P0**         |
| Logging               | ⚠️ Default logger only; OTP PII leak fixed                         | **P1**         |
| Monitoring            | ❌ No metrics, no uptime, no alerting                              | **P1**         |
| Error tracking        | ❌ None (no Sentry/equivalent)                                     | **P1**         |
| Database backups      | ❌ Not provisioned/verified                                        | **P0**         |
| SSL/TLS               | ✅ Render-managed; ⚠️ no HSTS/redirect proof                       | **P2**         |
| Rate limiting         | ✅ In-app throttles on auth/leads; add distributed store if scaled | **P2**         |
| API security          | ⚠️ Good bones; gaps (CSRF, headers)                                | **P1**         |
| Authentication        | ⚠️ OTP leak in dev mode; staff MFA off                             | **P0**         |
| Authorization         | ✅ RBAC + branch scope solid                                       | **P2**         |
| File uploads          | ⚠️ Validated; AV scanner is a stub                                 | **P0**         |
| Payment integration   | ⚠️ Dev-confirm gated; mock provider until secrets; refund saga gap | **P0**         |
| Notifications         | ⚠️ Real adapters exist; off in dev mode                            | **P1**         |
| Render deployment     | ⚠️ Blueprint on starter/prod; live sync required                   | **P0**         |

---

## 2. Critical blockers (P0) — do not launch until all are closed

- [x] **Flip `NODE_ENV` to `production` on API + worker.** `render.yaml` now sets the API
      to `NODE_ENV=production`, and the worker inherits it. Confirm the live Render services
      are synced before launch.
- [x] **Stop returning OTP codes to production clients.** `OtpService.issue()` only includes
      `devCode` outside production; the Render blueprint now boots production mode, so live
      clients should not receive OTP codes. Keep the non-prod dev code path for local QA only.
- [x] **Disable the dev payment-confirm endpoint.** `/payments/dev/confirm/:intentId` now
      requires both non-production mode and explicit `ENABLE_DEV_PAYMENT_CONFIRM=true`; Render
      sets the flag to `false`.
- [ ] **Provision real provider secrets** (Paystack live, Termii, SMTP) so payments and
      notifications actually work. `render.yaml` now declares the required secret placeholders,
      but values must be entered in Render before the production boot check will pass.
- [x] **Add rate limiting.** `@nestjs/throttler` is now globally enabled, with stricter limits
      on customer OTP request/verify, staff login/MFA, `/auth/refresh`, customer registration,
      and the public lead endpoint. Add Redis-backed throttler storage before horizontal scale.
- [ ] **Turn on staff MFA and stop storing the TOTP secret in plaintext.** Seed sets
      `mfaEnabled: false`; there is no enrollment endpoint; `mfaSecretRef` holds the raw secret
      ([staff-auth.service.ts:63](../apps/api/src/modules/identity/application/staff-auth.service.ts)).
      Admin/pharmacist accounts (PHI + refunds) are password-only with a known seed password.
- [ ] **Replace the AV scanner stub with a real engine.** `AvScannerService` only flags the
      EICAR test string ([av-scanner.service.ts](../apps/api/src/modules/prescription/application/av-scanner.service.ts)).
      Real malware in an uploaded prescription would be marked clean. Wire ClamAV/clamd or a
      cloud malware API behind the existing interface.
- [ ] **Provision and verify MongoDB backups + PITR.** `MONGODB_URI` is `sync: false`
      (operator-supplied). Backups are described only as intent in
      [08-infrastructure.md](architecture/08-infrastructure.md) — confirm Atlas automated
      backups + point-in-time recovery are enabled and run one restore drill.
- [x] **Move off Render free plans in the blueprint.** API + all three web apps now use
      `plan: starter` in [render.yaml](../render.yaml). Confirm billing/plan changes after
      the Blueprint sync.

---

## 3. High-priority issues (P1) — close in the first launch sprint

- [ ] **No structured logging.** Only NestJS `Logger`; no JSON logs, no request/correlation IDs
      (`traceId` is merely echoed from an inbound header in
      [all-exceptions.filter.ts](../apps/api/src/core/errors/all-exceptions.filter.ts), never generated).
- [x] **Mask OTP delivery failure logs.** OTP delivery failures now log a masked target, matching
      the SMS channel's posture. Still scrub PHI/PII platform-wide when structured logging lands.
- [ ] **No error tracking.** No Sentry or equivalent — unhandled 500s vanish into stdout.
- [ ] **No monitoring/alerting.** Health probes exist (`/health/live`, `/health/ready`) but
      nothing scrapes them; no metrics, no uptime checks, no alerts on payment/stock anomalies.
- [ ] **Refund saga gap.** `RefundService` calls the provider **before** the DB transaction
      ([refund.service.ts:70](../apps/api/src/modules/payment/application/refund.service.ts));
      a provider success + DB failure leaves money refunded but the order not REFUNDED and stock
      not released. The `OutboxEvent` collection exists but is **unused**.
- [ ] **Access tokens not revocable before expiry.** Logout/family-revoke only kills the refresh
      session; the 15-min access token keeps working
      ([jwt-auth.guard.ts](../apps/api/src/core/auth/jwt-auth.guard.ts) never checks session state).
- [ ] **No CSRF defense beyond `sameSite=lax`.** Acceptable for same-origin fetch today, but add a
      token for money-moving routes.
- [ ] **Notifications hard-depend on dev fallback.** Real Termii/SMTP adapters exist but only fire
      in production with secrets set; validate deliverability end-to-end before launch.
- [ ] **CI doesn't run integration or E2E.** [ci.yml](../.github/workflows/ci.yml) builds,
      typechecks, unit-tests, and format-checks only. The transactional money/stock invariants
      (integration suite needing Mongo+Redis) and the Playwright E2E never run in CI.

---

## 4. Medium-priority issues (P2)

- [ ] **HTTPS hardening unproven.** Render terminates TLS, and `helmet()` is enabled
      ([main.ts:24](../apps/api/src/main.ts)), but confirm HSTS, HTTP→HTTPS redirect, and that
      web apps set secure cookies (`secure` is already gated on `NODE_ENV==='production'`).
- [ ] **JWT is symmetric HS256, single secret, no rotation, no `aud` enforcement**
      ([token.service.ts](../apps/api/src/core/security/token.service.ts)). Plan RS256 + key rotation.
- [ ] **Account enumeration** on customer OTP-login (`NOT_FOUND` for unknown phone)
      ([customer-auth.service.ts:50](../apps/api/src/modules/identity/application/customer-auth.service.ts)).
- [ ] **Create-order has no idempotency key** — double-submit is only partially mitigated by the
      post-order cart clear ([order.service.ts](../apps/api/src/modules/order/application/order.service.ts)).
      `IdempotencyKey` collection exists but is unused.
- [ ] **Reconciliation job not scheduled** — `PaymentService.reconcile()` is a manual admin
      endpoint; nothing runs it on a timer, so missed webhooks aren't auto-recovered.
- [ ] **Queue processors run in the web process too** — both web API and worker boot the same
      `AppModule`, so the web dyno also runs BullMQ processors (Redis locks prevent double-exec,
      but it's wasteful/risky). See [worker.ts](../apps/api/src/worker.ts).
- [ ] **CORS allowlist is hard-coded** to `*.onrender.com` URLs in `render.yaml`; move to env per
      environment and confirm no wildcard.
- [ ] **License-expiry alerting missing** — index exists, no job; relies on verify-time blocking only.
- [ ] **Compliance `gap` items** from [12-compliance-readiness.md](architecture/12-compliance-readiness.md):
      branch activation doesn't enforce in-date `isSuperintendent`; registration captures only
      `marketingConsent`, not explicit `phiProcessing`; NAFDAC completeness not enforced at publish.

---

## 5. Nice-to-have improvements (P3)

- [ ] Per-app ESLint in CI (`eslint.ignoreDuringBuilds: true` on the Next apps).
- [ ] Guest cart + merge-on-login (cart currently requires a customer token → conversion drag).
- [ ] Address-aware delivery zone/fee (currently always `deliveryZones[0]`).
- [ ] Product image upload pipeline (admin has no image management).
- [ ] Password reset (staff; customer email-OTP path — `OtpChannel.EMAIL` currently throws).
- [ ] S3 server-side encryption (SSE-S3/KMS) + restrictive bucket policy + lifecycle/retention.
- [ ] Dependency/secret scanning (Dependabot, `gitleaks`) in CI.
- [ ] Load test the checkout→payment→fulfilment path at expected launch volume.

---

## 6. Validated checklist by audit area

### Environment variables — ⚠️

- [x] Typed + validated at boot via Zod; fails fast
      ([env.validation.ts](../apps/api/src/core/config/env.validation.ts)).
- [x] Production branch requires Termii/SMTP/Paystack secrets (`superRefine`).
- [x] Guard rejects localhost Mongo on Render.
- [x] **P0:** Render blueprint runs the API in `production`; confirm the live services are synced.
- [ ] **P2:** CORS origins hard-coded in `render.yaml` rather than env-driven.

### Secrets management — ⚠️

- [x] `JWT_SECRET` auto-generated by Render (`generateValue: true`); `MONGODB_URI` is `sync:false`.
- [x] Passwords hashed with Argon2 ([password.service.ts]) ; OTP/refresh stored as SHA-256.
- [ ] **P0:** TOTP `mfaSecretRef` stored as the raw secret, not a secrets-manager handle.
- [ ] **P3:** no secret scanning in CI; rotate the seeded staff password before go-live.

### Logging — ❌

- [ ] **P1:** no structured/JSON logging, no generated correlation IDs.
- [x] **P1:** OTP delivery failures mask the target instead of logging the full phone number.

### Monitoring — ❌

- [x] Liveness/readiness probes exist ([health.controller.ts](../apps/api/src/modules/health/health.controller.ts)).
- [ ] **P1:** nothing scrapes them; no metrics, uptime checks, or alerting.

### Error tracking — ❌

- [x] Canonical error envelope; unknown errors logged, internals not leaked to clients.
- [ ] **P1:** no Sentry/equivalent capturing exceptions with context.

### Database backups — ❌

- [ ] **P0:** Atlas backups + PITR are documented intent only; provision + run a restore drill.

### SSL/TLS — ✅/⚠️

- [x] Render-managed certs; `helmet()` security headers enabled.
- [x] Web cookies `httpOnly` + `secure` (gated on production) + `sameSite=lax`.
- [ ] **P2:** confirm HSTS + HTTP→HTTPS redirect.

### Rate limiting — ✅/⚠️

- [x] **P0:** in-app throttles added for OTP, login/MFA, refresh, registration, and leads.
- [ ] **P2:** add Redis-backed throttler storage before running multiple API instances.

### API security — ⚠️

- [x] Global `ValidationPipe` (`whitelist` + `forbidNonWhitelisted`) + per-route Zod
      ([main.ts:31](../apps/api/src/main.ts)).
- [x] `helmet`, CORS allowlist with `credentials`.
- [ ] **P1:** no CSRF token; **P1:** access tokens not revocable pre-expiry.

### Authentication — ⚠️

- [x] Refresh-token rotation + reuse detection (family revoke)
      ([session.service.ts](../apps/api/src/modules/identity/application/session.service.ts)).
- [x] **P0:** production deployment path no longer returns OTP `devCode`.
- [ ] **P0:** staff MFA off + plaintext secret; **P2:** account enumeration.

### Authorization — ✅

- [x] Global JWT guard; realm + permission + branch-scope guards
      ([authz.guards.ts](../apps/api/src/core/auth/authz.guards.ts)); Rx verify hard-gated on
      in-date PCN license; PHI access audited. Solid.
- [ ] **P2:** branch activation doesn't enforce in-date superintendent.

### File uploads — ⚠️

- [x] MIME allowlist + 10 MB limit + max-5 files
      ([prescription.controller.ts:48](../apps/api/src/modules/prescription/api/prescription.controller.ts)).
- [x] Stored in a private bucket; signed-URL access only, audited; AV scan **fails closed**.
- [ ] **P0:** AV scanner is an EICAR stub, not a real engine.

### Payment integration — ⚠️

- [x] Webhook HMAC-SHA512 verified with `timingSafeEqual`; amount/currency integrity check;
      idempotent event dedup; settlement atomic with stock reservation.
- [x] **P0:** dev-confirm endpoint is gated behind non-production plus explicit opt-in.
- [ ] **P0:** mock provider until secrets set; **P1:** refund saga gap.

### Notifications — ⚠️

- [x] Real Termii (SMS) + SMTP (email) adapters; queue-backed; destination masking.
- [ ] **P1:** only active in production with secrets; verify deliverability before launch.

### Render deployment — ⚠️

- [x] **P0:** blueprint moves API + 3 web apps to `plan: starter` and API `NODE_ENV=production`.
- [ ] **P0:** sync the Blueprint in Render and verify the live service env/plan match the file.
- [x] Build filters, health-check path, worker `maxShutdownDelaySeconds`, Redis `keyvalue`
      service, autodeploy-on-commit all configured sensibly ([render.yaml](../render.yaml)).

---

## 7. Execution plan to reach production readiness

### Phase 0 — Stop the bleeding (1–2 days, blocks all customer traffic)

Goal: the deployed environment is no longer a public dev build.

1. Set `NODE_ENV=production` on `lanyard-api` and `lanyard-api-worker`.
2. Provision MongoDB Atlas (replica set) with automated backups + PITR enabled; set
   `MONGODB_URI`; run one restore drill and record RPO/RTO.
3. Add Paystack live, Termii, and SMTP secrets; confirm the real Paystack provider is selected
   and the dev-confirm route 404s.
4. Smoke test: OTP no longer returned in responses; a real test charge settles via webhook only.
   **Exit criteria:** no auth bypass, no free-payment path, data is recoverable.

### Phase 1 — Security hardening (3–5 days)

1. Add `@nestjs/throttler`; strict limits on OTP request/verify, staff login, `/auth/refresh`,
   `/leads`.
2. Build staff MFA enrollment; move the TOTP secret to a secrets manager; enforce MFA for
   `phi:view`/`refund:create`; rotate the seeded password; add staff login lockout.
3. Replace AV stub with ClamAV/clamd (or cloud malware API) behind the existing interface.
4. Move API + web apps to paid Render plans with ≥1 always-on instance.
   **Exit criteria:** abuse-resistant auth, malware actually scanned, no cold starts.

### Phase 2 — Observability & money integrity (3–5 days)

1. Structured JSON logging + generated correlation IDs; scrub PII/PHI (fix the phone-in-logs).
2. Error tracking (Sentry) wired into the exception filter with request context.
3. Uptime checks against `/health/ready` + alerts on payment/stock anomalies; basic metrics.
4. Make refunds saga-safe (provider-call-then-DB-fail can't strand money); wire the outbox.
5. Schedule the reconciliation job on the worker; add idempotency to create-order.
   **Exit criteria:** failures are visible, and no money/stock path can desync.

### Phase 3 — Quality gates & compliance (3–5 days)

1. Run the integration + E2E suites in CI (ephemeral Mongo replica set + Redis).
2. Add CSRF token for state-changing routes; per-app ESLint; Dependabot + secret scanning.
3. Close compliance `gap` items: in-date superintendent on branch activation, `phiProcessing`
   consent at registration, NAFDAC completeness at publish, license-expiry alerts.
4. S3 SSE + restrictive bucket policy + retention lifecycle.
   **Exit criteria:** the launch gates in
   [09-mvp-definition.md](architecture/09-mvp-definition.md) and the compliance checklist are green.

### Phase 4 — Fast-follow (post-launch)

RS256 + key rotation, guest cart, address-aware delivery fees, product image pipeline, password
reset flows, load testing at projected volume.

---

### Go / No-go gate

**Go only when every Phase 0 and Phase 1 box is checked**, Phase 2 observability is live, and the
compliance `gap` items are either implemented or signed off as named manual controls with an owner.
