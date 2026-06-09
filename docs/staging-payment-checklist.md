# Payment Staging Checklist — Lanyard Pharmacy

Use this before promoting to a real Paystack test-key environment.

## 1 · Environment variables

| Variable | Required in staging | Notes |
|---|---|---|
| `PAYSTACK_SECRET_KEY` | ✅ | Test key (`sk_test_…`). Production env validation now requires it. |
| `PAYSTACK_WEBHOOK_SECRET` | ✅ | Used explicitly for webhook HMAC verification. In Paystack this is normally the same `sk_test_…` value. |
| `MONGODB_URI` | ✅ | Replica set required (transactions used in settlement). |
| `REDIS_URL` | ✅ | BullMQ reconcile queue. |

## 2 · Paystack dashboard config

- [ ] Add the staging webhook URL: `https://<staging-host>/api/v1/webhooks/paystack`
- [ ] Enable events: **charge.success** (minimum), optionally **refund.processed**
- [ ] Confirm webhook IP whitelist if your provider has one (Paystack: 52.31.139.75, 52.49.173.169, 52.214.14.220)

## 3 · End-to-end payment flow

- [ ] `POST /api/v1/payments/intents` with a real customer token → returns `authorizationUrl`
- [ ] Visit the Paystack test checkout URL and complete with test card `4084084084084081` / exp `01/99` / CVV `408`
- [ ] Confirm `POST /api/v1/webhooks/paystack` receives a `charge.success` event
- [ ] Order status transitions to `PAID`
- [ ] `payment_txns` collection gains an append-only record with the Paystack event id
- [ ] Customer receives an email notification via the notification worker

## 4 · Idempotency / replay safety

- [ ] Send the same `charge.success` webhook payload twice → second call returns `{ status: 'duplicate' }` with no double-settlement
- [ ] Verify `providerEventId` uniqueness constraint is enforced in MongoDB (`db.payment_txns.getIndexes()`)

## 5 · Webhook signature

- [ ] Send a webhook with a wrong/missing `x-paystack-signature` header → API returns `200 { status: 'rejected' }` (not 4xx)
- [ ] Confirm the security-level log line (`Webhook rejected: …`) appears in API logs

## 6 · Reconciliation

- [ ] Manually leave an intent in `PENDING` state (e.g. kill the API before the webhook arrives)
- [ ] Call `POST /api/v1/admin/payments/reconcile` with a staff token
- [ ] Confirm the intent is verified against Paystack and settled if paid
- [ ] Confirm already-settled intents are not re-processed (idempotent)

## 7 · Refund flow

- [ ] `POST /api/v1/admin/payments/refund` with `{ orderId, reason }` → returns `{ status: "processing" }` (Paystack refunds are async)
- [ ] Confirm `refunds` collection records the Paystack refund id
- [ ] Order status transitions to `REFUNDED`
- [ ] Inventory reservation is released (check branch stock levels)

## 8 · Amount / currency guard

- [ ] Craft a webhook payload with a different `amount` but valid signature → API returns `CONFLICT` / intent marked `FAILED` / audit event recorded
- [ ] Same test for mismatched `currency`

## 9 · Dev confirm endpoint disabled

- [ ] `POST /api/v1/payments/dev/confirm/<id>` on staging → returns 404

## 10 · Rollback / failure path

- [ ] Force-fail an intent (e.g. incorrect card details in test mode) → order stays in `AWAITING_PAYMENT`
- [ ] Retry with a successful payment → flow completes, no duplicate transactions

---
> Related code: `apps/api/src/modules/payment/`, `docs/architecture/03-backend-module-design.md §6`, `docs/architecture/10-risks-mitigation.md`
