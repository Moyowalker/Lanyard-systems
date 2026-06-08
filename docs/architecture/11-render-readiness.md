# 11 - Backend Readiness and Render Deployment

Last verified: 2026-06-07

This note captures what was validated in the current backend, what still needs work
before a public production launch, and the exact Swagger URL pattern to share once the
API is deployed on Render.

---

## 1. Backend readiness snapshot

Validated successfully from the monorepo root:

- `pnpm --filter @lanyard/api build`
- `pnpm --filter @lanyard/api typecheck`
- `pnpm --filter @lanyard/api test`
- `pnpm --filter @lanyard/api test:int`

What that confirms today:

- The NestJS API compiles cleanly for deployment.
- The API boots with the current module graph and environment validation.
- Unit coverage exists for crypto helpers, order state transitions, prescription AV scan,
  and notification templating.
- Integration coverage proves key database-backed flows: customer OTP login, staff login,
  cart creation, OTC checkout, payment confirmation, prescription upload, pharmacist
  verification, and prescription-gated ordering.

Current backend surfaces wired into the app module include:

- auth and identity
- RBAC and branch management
- catalog and pricing
- cart and order flows
- prescription upload and verification
- payment initiation and webhook/dev confirmation
- notifications, queues, and health probes

## 2. Known gaps before public production launch

The backend is in good shape for staging and stakeholder review, but these gaps still
matter before live public traffic:

- OTP delivery is still dev-oriented. `OtpService` logs the code and returns `devCode`
  outside production, but it does not yet hand off OTPs to a real SMS or email provider.
- The SMS channel is a stub adapter. `SmsChannel` logs messages and returns a synthetic
  provider reference instead of calling a gateway.
- `/api/v1/health/ready` currently checks MongoDB connectivity only. Redis, object
  storage, SMTP, and payment-provider reachability are not part of the readiness probe.
- Prescription uploads and signed downloads depend on S3-compatible storage being
  configured correctly in the deployment environment.
- Queue-backed work should run in a separate worker process on Render if you want AV scan,
  notification retries, and other asynchronous jobs to behave reliably outside the web
  request lifecycle.

Treat this as: backend-ready for staging/demo use, not yet fully hardened for a public
production launch without provider wiring and ops polish.

## 3. Render deployment shape

Recommended Render setup:

- One Web Service for the HTTP API
- One Background Worker for BullMQ processors
- Managed MongoDB (for example MongoDB Atlas)
- Managed Redis
- S3-compatible object storage
- SMTP relay and, if required, an SMS provider

The repository already includes a container build path at
`infra/docker/api.Dockerfile`.

Suggested service commands:

- Web service: `node dist/main.js`
- Worker service: `node dist/worker.js`

Suggested health check path:

- `/api/v1/health/ready`

If you change `API_GLOBAL_PREFIX`, update the health-check and Swagger paths to match.

## 4. Environment variables for Render

Minimum boot-critical variables:

- `NODE_ENV=production`
- `MONGODB_URI`
- `JWT_SECRET`

Strongly recommended for a useful staging or production deployment:

- `API_GLOBAL_PREFIX` (default is `api/v1`)
- `CORS_ORIGINS`
- `REDIS_URL`
- `S3_ENDPOINT`
- `S3_REGION`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `S3_BUCKET`
- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_WEBHOOK_SECRET`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_FROM`

Feature notes:

- Without `REDIS_URL`, queue-backed workloads are not production-ready.
- Without the S3 variables, prescription document flows will not behave correctly.
- Without Paystack secrets, only mock/dev payment behavior should be expected.
- Without SMTP or an SMS provider, notifications and OTP delivery remain incomplete.

## 5. Swagger URLs

Local development:

- Swagger UI: `http://localhost:4000/api/v1/docs`
- Raw OpenAPI JSON: `http://localhost:4000/api/v1/docs-json`

Render deployment pattern:

- Swagger UI: `https://<your-render-service>.onrender.com/api/v1/docs`
- Raw OpenAPI JSON: `https://<your-render-service>.onrender.com/api/v1/docs-json`

If you attach a custom domain, keep the same path suffixes:

- `https://api.your-domain.com/api/v1/docs`
- `https://api.your-domain.com/api/v1/docs-json`

For stakeholder sharing, the Swagger UI URL is usually the best link. The JSON endpoint
is more useful for frontend generation, API clients, or Postman import.