# 11 - Backend Readiness and Render Deployment

Last verified: 2026-06-09

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
- One Render Key Value instance for Redis-compatible queues/cache
- One Web Service each for `web-store`, `web-admin`, and `web-marketing`
- External MongoDB replica set (for example MongoDB Atlas)
- Optional S3-compatible object storage, SMTP relay, and SMS provider

The repository now includes a Render Blueprint at `render.yaml` that wires up this
shape for a first staging deploy.

Important platform note:

- Render does not provide managed MongoDB, and this app expects Mongo transactions.
  Use a replica-set-backed MongoDB URI from Atlas or another external provider.

The repository also still includes a container build path at
`infra/docker/api.Dockerfile`, but the Blueprint currently uses Render's native Node
runtime for the fastest first deploy.

Blueprint defaults worth knowing:

- API and worker start in `NODE_ENV=development` on purpose so the first staging deploy
  does not block on Termii, SMTP, and Paystack production secrets.
- When you switch the API and worker to `NODE_ENV=production`, set the required
  Termii, SMTP, and Paystack variables on `lanyard-api`; the worker inherits the
  same provider variables from the API service.
- The three Next.js apps now accept either `API_URL` or Render's internal
  `API_HOSTPORT` + `API_GLOBAL_PREFIX` to reach the API over the private network.
- The marketing app receives both `STORE_URL` and `NEXT_PUBLIC_STORE_URL`, so its
  store handoff links resolve to `https://lanyard-web-store.onrender.com` on Render.
- The API health check remains `/api/v1/health/ready`.

If you change `API_GLOBAL_PREFIX`, update the health-check, frontend env values, and
Swagger paths to match.

## 4. Environment variables for Render

Blueprint-provided values:

- `JWT_SECRET` is generated automatically for the API service.
- `REDIS_URL` is injected from the Render Key Value instance.
- The Next.js apps receive `API_HOSTPORT` and `API_GLOBAL_PREFIX` for internal API
  access.

Values you must still set manually for a working Render environment:

- `MONGODB_URI`

Recommended additions once you move beyond a bare staging deploy:

- `CORS_ORIGINS`
- `S3_ENDPOINT`
- `S3_REGION`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `S3_BUCKET`
- `S3_FORCE_PATH_STYLE` (`false` for AWS S3, often `true` for MinIO-style endpoints)
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_FROM`
- `SMTP_USER` / `SMTP_PASS` when your relay requires auth
- `TERMII_API_KEY`
- `TERMII_SENDER_ID`
- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_WEBHOOK_SECRET`

Temporary staging note:

- With the Blueprint's default `NODE_ENV=development`, the API can boot without the SMS,
  SMTP, and Paystack secrets above.
- Before public launch, switch API + worker to `NODE_ENV=production` and provide the
  production-grade provider secrets required by `env.validation.ts`.

Feature notes:

- Without `REDIS_URL`, queue-backed workloads degrade or fail; the Blueprint handles this.
- Without the S3 variables, prescription document flows will not behave correctly.
- Without Paystack secrets, only mock/dev payment behavior should be expected.
- Without SMTP or Termii, notifications and OTP delivery remain incomplete.

## 4.1 First Render sync checklist

Use the `render.yaml` Blueprint and set these values during the first sync:

1. `MONGODB_URI` from MongoDB Atlas (or another replica-set-backed Mongo provider).
2. Confirm the service names stay as `lanyard-api`, `lanyard-web-store`,
   `lanyard-web-admin`, and `lanyard-web-marketing` if you want the default `.onrender.com`
   URLs in the Blueprint to stay correct.
3. After the first successful deploy, open the API docs and health endpoints, then test:
   - marketing to store handoff
   - customer OTP request/verify
   - staff login from web-admin
4. Add S3, SMTP, Termii, and Paystack variables incrementally as each flow is required.

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
