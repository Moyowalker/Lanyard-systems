# 08 — Infrastructure Architecture

Containerized, environment-promoted, observable. Optimized for a small team to run
reliably, with Nigerian latency and reliability realities in mind.

---

## 1. Environments

| Env            | Purpose         | Data                                              | Access               |
| -------------- | --------------- | ------------------------------------------------- | -------------------- |
| **local**      | Dev laptops     | Dockerized mongo/redis/minio/mailpit, seeded      | Engineers            |
| **staging**    | Pre-prod mirror | Anonymized/synthetic; real provider **test** keys | Team + QA            |
| **production** | Live            | Real PHI/payments                                 | Locked down, audited |

Promotion is **image-based**: the exact image tested in staging is what ships to prod.
Config differs only by environment variables/secrets, never by code.

---

## 2. Runtime topology (production)

```
                       ┌──────────────┐
        Internet ─────▶│   CDN / WAF  │  (edge cache, TLS, DDoS/WAF, rate limit)
                       └──────┬───────┘
                              ▼
                     ┌─────────────────┐
                     │  Reverse proxy  │  (routing by host)
                     │  / ingress      │
                     └───┬───┬───┬─────┘
            ┌────────────┘   │   └────────────┐
            ▼                ▼                ▼
   ┌────────────────┐ ┌────────────┐ ┌────────────────┐
   │ web-marketing  │ │ web-store  │ │ web-admin      │   (Next.js, stateless, N replicas)
   └────────────────┘ └─────┬──────┘ └───────┬────────┘
                            └────────┬────────┘
                                     ▼
                            ┌─────────────────┐
                            │   api  (NestJS) │  (stateless, N replicas, autoscaled)
                            └───┬────┬────┬───┘
                                │    │    │
              ┌─────────────────┘    │    └───────────────┐
              ▼                      ▼                     ▼
      ┌───────────────┐      ┌─────────────┐      ┌────────────────┐
      │ MongoDB       │      │   Redis     │      │ Object store   │
      │ replica set   │      │ (queue/     │      │ (S3-compatible,│
      │ (PSS) + bkup  │      │  cache)     │      │  encrypted)    │
      └───────────────┘      └──────┬──────┘      └────────────────┘
                                    ▼
                            ┌───────────────┐
                            │ worker(s)     │  (same image, BullMQ consumers)
                            └───────────────┘
        External: Paystack/Flutterwave · SMS/Email/WhatsApp · Sentry · Maps
```

---

## 3. Containerization

- **Every app ships as a container.** Multi-stage Dockerfiles: build with full toolchain,
  run on a minimal hardened base (distroless/alpine), **non-root** user, read-only FS
  where possible.
- `api` and `worker` are the **same image**, different start command (`main` vs `worker`).
- Next.js apps use the **standalone output** for small runtime images.
- Local dev: `docker-compose.dev.yml` brings up mongo (as a single-node **replica set** so
  transactions work), redis, minio, mailpit.
- Image tags are **immutable** and tied to git SHA / release tag.

---

## 4. Hosting strategy & region

**Recommendation:** managed container platform + **managed MongoDB** + **managed Redis**

- S3-compatible object storage.

* **Region/latency:** users and providers are Nigeria-centric. Choose the lowest-latency
  viable region (e.g. AWS `af-south-1` Cape Town, or EU-West as a common compromise) and
  put a **CDN edge** in front for static assets and marketing pages. Re-evaluate as a
  local/closer region or provider becomes attractive.
* **MongoDB:** **Atlas** (or equivalent managed) — gives replica set, backups, PITR,
  monitoring, and an easy path to sharding/Atlas Search without us operating Mongo.
* **Redis:** managed (Elasticache/Upstash/Redis Cloud) with persistence for queues.
* **Object store:** S3/compatible with **SSE encryption** + bucket policies + signed URLs.

This keeps the team writing product, not operating databases, while staying portable
(everything is containerized + standard managed services).

---

## 5. CI/CD (GitHub Actions)

**CI (every PR):**

```
1. install (pnpm, cached)
2. nx affected: lint + typecheck + unit + integration (testcontainers)
3. build affected apps
4. OpenAPI ↔ api-client drift check
5. security: dependency audit + secret scan + SAST
6. (PR preview deploy optional)
```

**CD (merge to main / tag):**

```
1. build immutable images (api, worker, 3 web apps), tag = git SHA
2. push to container registry
3. run DB migration/seed plan (idempotent, gated)
4. deploy → staging (auto)
5. smoke + E2E (Playwright) on staging
6. manual approval gate
7. deploy → production (rolling, health-checked)
8. post-deploy smoke + alert on failure → auto-rollback to previous image
```

- **Migrations:** Mongo is schema-flexible, but we still run **versioned, idempotent
  migration scripts** (index creation, backfills, enum changes) tracked in a
  `migrations` collection. Index builds on large collections run in the background.
- **Rollback:** redeploy previous image; migrations written to be backward-compatible
  (expand/contract pattern) so a rollback never breaks on data shape.

---

## 6. Secrets & configuration

- **Typed config**: app boots only if required env vars validate (fail fast).
- Secrets from a **manager** (cloud secrets manager / SOPS / Doppler) injected at
  runtime — never in the repo, image, or logs.
- Separate credentials per environment; provider **test** keys in staging, live in prod.
- `infra/env/*.example` documents every variable (no values).

---

## 7. Object storage & PHI handling

- Prescription images/documents in a **private, encrypted** bucket.
- Uploads go through the API (validated: type, size) → AV-scanned by a worker → marked
  `clean` before any pharmacist can act.
- Access only via **short-lived signed URLs**, issuance audited.
- Lifecycle rules + retention aligned to the data policy (doc 05/10).

---

## 8. Observability

| Pillar       | Tooling                             | What we capture                                                       |
| ------------ | ----------------------------------- | --------------------------------------------------------------------- |
| **Logs**     | pino (JSON), shipped to a log store | Structured, `traceId`, actor, branch — **no PHI/secrets**             |
| **Metrics**  | Prometheus/Grafana or hosted        | Latency, error rate, queue depth, payment success rate, Rx-verify SLA |
| **Tracing**  | OpenTelemetry                       | Request → service → job correlation                                   |
| **Errors**   | Sentry                              | API + web apps, source-mapped, alerting                               |
| **Uptime**   | External monitor                    | Synthetic checks on store/checkout/health                             |
| **Business** | Dashboards                          | Orders/day, GMV, abandoned carts, low stock, failed payments          |

**Health endpoints:** `/health/live` (process up) and `/health/ready` (mongo, redis,
object store, providers reachable) drive orchestrator probes and load-balancer routing.

**Alerting (examples):** payment webhook failures, reconciliation backlog, queue depth
spikes, Rx-verification queue aging past SLA, error-rate thresholds, low-stock on
fast-movers, certificate expiry.

---

## 9. Reliability, backup & DR

| Concern                  | Plan                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| **Backups**              | Managed Mongo automated backups + **point-in-time recovery**; periodic restore drills      |
| **Object store**         | Versioning + cross-region replication for PHI/docs                                         |
| **RPO/RTO**              | Targets defined with the business; PITR keeps RPO low                                      |
| **Stateless apps**       | Trivially re-creatable from images; no local state                                         |
| **Idempotency + outbox** | No lost/duplicated payments or events across restarts                                      |
| **Graceful degradation** | If a provider (SMS/payment) is down: queue + retry, surface clear UX, never lose the order |
| **Multi-replica**        | API/web run ≥2 replicas; Mongo PSS (primary+2) for HA                                      |

---

## 10. Scaling path (without re-architecting)

1. **Vertical + replicas** first (stateless apps scale horizontally trivially).
2. **Read scaling**: Mongo secondaries for reporting/read models; cache hot catalog in Redis.
3. **Queue scaling**: add `worker` replicas by queue depth.
4. **Search**: graduate from Mongo text index → Atlas Search / dedicated engine.
5. **Sharding**: shard high-volume collections (`orders`, `audit_logs`, `stock_movements`)
   by `branchId`/time when needed.
6. **Service extraction**: peel a module (e.g. `payment`, `notification`) into its own
   service using the existing boundaries + event bus — no rewrite.

---

## 11. Network & application security (infra layer)

- TLS everywhere; HSTS; modern ciphers.
- **WAF + rate limiting + bot protection** at the edge; stricter limits on auth/payment.
- Private networking between app ↔ data tier; databases never publicly exposed.
- Admin app optionally IP-allow-listed; separate subdomain.
- Least-privilege IAM for every service credential.
- Regular dependency/image scanning in CI; base-image patch cadence.
- Penetration test before go-live (see doc 10).
