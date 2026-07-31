# 11 - Hostinger Production Deployment

Last updated: 2026-07-25

This is the canonical production runbook for Lanyard Pharmacy. Application compute and
Redis run on a Hostinger Ubuntu VPS. MongoDB Atlas and the private S3-compatible object
store remain external managed services.

## 1. Production topology

| Hostname                    | Container       | Purpose                 |
| --------------------------- | --------------- | ----------------------- |
| `lanyardpharmacy.com`       | `web-marketing` | Public marketing site   |
| `www.lanyardpharmacy.com`   | Caddy redirect  | Canonical root redirect |
| `store.lanyardpharmacy.com` | `web-store`     | Customer storefront     |
| `admin.lanyardpharmacy.com` | `web-admin`     | Staff operations        |
| `api.lanyardpharmacy.com`   | `api`           | NestJS API and Swagger  |

Caddy is the only public container and publishes ports 80 and 443. API, worker, web
applications, and Redis communicate on the private Compose network. API and worker use
the same image from `infra/docker/api.Dockerfile`; the worker overrides the command with
`node dist/worker.js`.

The initial VPS baseline is Ubuntu with 4 vCPU and 8 GB RAM. This is a single-host
deployment, not a high-availability design. Atlas, S3, Hostinger backups, and immutable
container images are the recovery path after a host failure.

## 2. Repository deployment assets

- `infra/docker/api.Dockerfile`: API and worker image.
- `infra/docker/web.Dockerfile`: parameterized standalone Next.js image.
- `infra/docker/docker-compose.prod.yml`: production services and health checks.
- `infra/caddy/Caddyfile`: TLS, redirects, and hostname routing.
- `infra/hostinger/production.env.example`: non-secret environment contract.
- `.github/workflows/deploy-hostinger.yml`: image publishing and approved deployment.
- `scripts/deploy/hostinger.sh`: immutable-SHA deployment and rollback.

Application images are tagged with the full Git commit SHA. A release must use the same
SHA for API and all three web images. Do not deploy or roll back with `latest`.

## 3. One-time VPS bootstrap

1. Install current Ubuntu security updates, Docker Engine, and the Docker Compose plugin.
2. Create a restricted deployment user with access to Docker and `/opt/lanyard`; do not
   deploy as root.
3. Require SSH keys, disable password and direct root login, and record the pinned SSH
   host key for GitHub Actions.
4. Allow inbound SSH from restricted administration sources where practical, plus ports
   80 and 443. Do not expose Redis or application ports.
5. Enable unattended security updates, time synchronization, Hostinger off-site backups,
   and an encrypted VPS snapshot schedule.
6. Authenticate Docker to GHCR with a read-only package token.
7. Create `/opt/lanyard/releases` and `/opt/lanyard/shared`. Copy
   `infra/hostinger/production.env.example` to
   `/opt/lanyard/shared/production.env`, replace every placeholder, and set mode `0600`.
8. Allow only the VPS static egress IP through the Atlas network policy.

### 3.1 SSH access as the deploy user

Use the `deploy` account for interactive access and deployments. The intent is that you
can log in, inspect releases, edit files when needed, and run the release script without
becoming root.

1. Add your public key to `/home/deploy/.ssh/authorized_keys` on the VPS.
2. Confirm the `deploy` user is in the Docker group so it can run `docker` and
   `docker compose` without `sudo`.
3. Keep `PermitRootLogin no` and password login disabled; SSH should be key-only.
4. Record the VPS host key in `VPS_SSH_KNOWN_HOSTS` before any GitHub Actions deploys.
5. Connect from your machine with:

   ```bash
   ssh deploy@<vps-hostname-or-ip>
   ```

6. After login, check the release root and current deployment state:

   ```bash
   cd /opt/lanyard
   ls -la
   cat current-release
   ```

7. Make changes in the checked-out release tree only if you understand the impact; for
   long-lived edits, update the source repo and redeploy instead of patching a live
   release in place.
8. Deploy the current commit SHA from the VPS with the release script:

   ```bash
   DEPLOY_ROOT=/opt/lanyard sh /opt/lanyard/releases/<full-git-sha>/scripts/deploy/hostinger.sh
   ```

9. Roll back to the previous release with:

   ```bash
   DEPLOY_ROOT=/opt/lanyard sh /opt/lanyard/releases/<current-sha>/scripts/deploy/hostinger.sh --rollback
   ```

If you need shell history or ad hoc inspection, prefer the `deploy` user over root and
only escalate with `sudo` for OS-level maintenance.

### 3.2 Troubleshooting `Permission denied (publickey)`

This error means the VPS reached your SSH client, but it did not accept any of the keys
presented by your machine. The usual causes are a missing public key on the server, the
wrong private key on your laptop, or incorrect permissions on the server account.

1. Try the connection with an explicit key and verbose logging:

   ```bash
   ssh -vvv -i ~/.ssh/id_ed25519 deploy@187.124.166.172
   ```

2. Make sure the matching public key is in `/home/deploy/.ssh/authorized_keys` on the
   VPS, not just on the `root` account or another user.
3. Confirm the server-side permissions are strict:

   ```bash
   chmod 700 /home/deploy/.ssh
   chmod 600 /home/deploy/.ssh/authorized_keys
   chown -R deploy:deploy /home/deploy/.ssh
   ```

4. If you have multiple keys on Windows, point SSH at the correct one instead of relying
   on auto-discovery.
5. If the key was newly added, try a fresh session after saving `authorized_keys`.

The production environment must include Atlas, Redis, JWT, CORS, S3, Sendchamp, Resend
(or SMTP), Paystack, and ACME values. API validation intentionally rejects missing Redis/S3/provider
configuration and localhost MongoDB in production.

## 4. GitHub production environment

Create a protected GitHub Environment named `production` with required reviewers.

### Environment secrets

- `VPS_SSH_PRIVATE_KEY`
- `VPS_SSH_KNOWN_HOSTS`

### Environment variables

- `VPS_HOST`
- `VPS_PORT` (normally `22`)
- `VPS_USER`
- `VPS_DEPLOY_ROOT` (normally `/opt/lanyard`)

The image-build job runs before production approval, so add these non-secret values as
repository variables rather than protected environment variables:

### Repository variables

- `NEXT_PUBLIC_GA_ID`
- `NEXT_PUBLIC_SENTRY_DSN`
- `NEXT_PUBLIC_POSTHOG_KEY`
- `NEXT_PUBLIC_POSTHOG_HOST` (normally `https://eu.i.posthog.com`)
- `NEXT_PUBLIC_SUPPORT_PHONE_E164`
- `NEXT_PUBLIC_SUPPORT_PHONE_DISPLAY`
- `NEXT_PUBLIC_SUPPORT_WHATSAPP_URL`
- `NEXT_PUBLIC_SUPPORT_HOURS`

The workflow starts only after the `CI` workflow succeeds on `main`. It builds and pushes
four GHCR images, then waits for production approval. Runtime provider secrets stay in
the protected VPS environment file and are never copied into GitHub workflow logs or web
images.

## 5. First deployment before DNS

Before approving the first production job:

1. Take an Atlas on-demand backup and complete a disposable restore drill.
2. Confirm S3 objects are private, versioned as required, and accessible with expiring
   signed URLs.
3. Audit suspended legacy Redis queues for actionable payment reconciliation,
   notification, or prescription scan jobs. Approve a fresh VPS Redis only after the
   audit is recorded.
4. Build all four images and validate Compose locally:

   ```bash
   docker compose --env-file infra/hostinger/production.env.example \
     -f infra/docker/docker-compose.prod.yml config --quiet
   ```

5. Point a restricted temporary hostname or local hosts-file entries at the VPS and
   verify Caddy routing before public DNS changes.
6. Run the API, customer, staff, payment, prescription, notification, and worker smoke
   checks. Production startup must not run the seed command.

## 6. DNS and provider cutover

Create Hostinger DNS records for the apex, `www`, `store`, `admin`, and `api` hostnames
using the VPS static IP. Caddy obtains and renews certificates after public DNS resolves.

Then update Paystack to:

```text
https://api.lanyardpharmacy.com/api/v1/webhooks/paystack
```

Update any S3 CORS policy, Sendchamp, Resend/SMTP, Sentry, PostHog, analytics, and search
console allowlists discovered during the inventory. API CORS must contain only the four
public application origins and must not use a wildcard.

Customer and staff cookies remain host-only. Do not configure a shared parent-domain
cookie: storefront and admin sessions are separate security realms.

## 7. Deployment and rollback

For normal releases, merge to `main`, wait for CI and image builds, then approve the
`production` environment. The deployment script:

1. validates Compose with the protected environment;
2. pulls the selected SHA-tagged images;
3. waits for container health;
4. verifies API readiness inside the private network;
5. records the successful and prior release SHAs.

The workflow then verifies all public HTTPS endpoints. Internal or public health failure
restores the recorded prior SHA. A first deployment has no automatic rollback target and
therefore requires a VPS snapshot and explicit operator supervision.

Manual rollback on the VPS:

```bash
DEPLOY_ROOT=/opt/lanyard sh \
  /opt/lanyard/releases/<current-sha>/scripts/deploy/hostinger.sh --rollback
```

## 8. Verification and operations

After every release verify:

- `/api/v1/health/live` reports process liveness.
- `/api/v1/health/ready` reports MongoDB and Redis up.
- Customer OTP responses never include `devCode`.
- Storefront, cart, checkout, prescription upload/download, and contact lead work.
- Staff login and operational mutations work on the admin hostname.
- Paystack webhook, duplicate delivery, reconciliation, and refund checks pass.
- Worker repeat jobs are registered and queue failures appear in monitoring.
- Sentry receives controlled test errors and PostHog follows PHI recording restrictions.

Back up the Redis volume and Caddy state with the VPS. Atlas and S3 retain independent
backup policies. Reboot the VPS during a planned test and verify Docker, Redis, Caddy,
API, worker, and web applications recover automatically.

## 9. Swagger URLs

- Local UI: `http://localhost:4000/api/v1/docs`
- Local JSON: `http://localhost:4000/api/v1/docs-json`
- Production UI: `https://api.lanyardpharmacy.com/api/v1/docs`
- Production JSON: `https://api.lanyardpharmacy.com/api/v1/docs-json`

## 10. Go-live blockers

Infrastructure migration does not waive product or compliance gates. Do not accept real
customers, prescriptions, or payments until the production checklist closes the real AV
scanner, staff MFA/security, provider credentials, Atlas restore proof, monitoring, and
required PCN/NDPA/NAFDAC controls.
