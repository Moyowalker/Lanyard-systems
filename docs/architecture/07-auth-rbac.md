# 07 — Authentication & RBAC Strategy

Security-first. We protect **money, medicines, and PHI**, so identity and authorization
are designed conservatively, with separate realms for customers and staff.

---

## 1. Two identity realms

|                | Customer realm                            | Staff realm                         |
| -------------- | ----------------------------------------- | ----------------------------------- |
| Collection     | `customers`                               | `staff_users`                       |
| Primary login  | **Phone + OTP** (email/password optional) | **Email + password + MFA**          |
| MFA            | Optional (recommended for high-value)     | **Required** for pharmacists/admins |
| Token audience | `aud: customer`                           | `aud: staff`                        |
| Apps           | `web-store`                               | `web-admin`                         |
| Risk profile   | Many users, lower per-user privilege      | Few users, high privilege, audited  |

Tokens from one realm are **never** valid in the other (enforced by `aud` claim + guard).
This prevents a customer token from ever reaching staff endpoints.

---

## 2. Token model

- **Access token (JWT, short-lived ~15 min):** signed (RS256/asymmetric so verification
  can be distributed later). Claims: `sub`, `realm`, `aud`, `roles`, `permissions`
  (or a permissions hash), `branchScope`, `sessionId`, `iat`, `exp`.
- **Refresh token (opaque, long-lived, rotating):** stored **hashed** in `sessions`.
  Every refresh **rotates** the token and invalidates the prior one; reuse of an old
  refresh token → **session family revoked** (theft detection).
- **Web delivery:** tokens in **httpOnly, Secure, SameSite cookies** set by the app's
  BFF route handlers — never in `localStorage` (XSS-resistant).
- **Mobile/API delivery:** Bearer tokens via Authorization header (same endpoints).
- **Logout / revoke:** deletes the session; `GET /me` and guards reject revoked sessions.

> Permissions may be embedded in the access token for speed, but **branch-scope and
> sensitive-permission checks are re-validated server-side** against the DB for
> high-risk actions (refunds, Rx verify, role changes) so a stale token can't be abused.

---

## 3. OTP (phone-first, Nigeria)

- OTP via SMS (and email fallback) through the `notification` module.
- Stored **hashed** in `otp_challenges` with: max attempts, lockout, short TTL, single-use.
- Rate-limited per phone + per IP to resist enumeration and SMS-pumping abuse.
- Used for: customer login/registration, phone verification, password reset, and
  step-up confirmation on sensitive actions if needed.

---

## 4. Staff MFA

- **TOTP (authenticator app)** primary; SMS OTP fallback.
- MFA secrets referenced via the secrets manager, not stored as plaintext.
- **Mandatory** for `PHARMACIST`, `ADMIN`, `SUPER_ADMIN`, `BRANCH_MANAGER`.
- Step-up MFA can be required for the most sensitive actions (e.g. issuing refunds,
  changing roles) even within an active session.

---

## 5. RBAC model: roles → permissions, scoped by branch

Authorization = **(permission check) AND (branch-scope check)**.

### Permissions (fine-grained, seeded catalog)

`resource:action` form, e.g.:

```
catalog:read  catalog:write
inventory:read inventory:adjust inventory:receive
order:read order:transition order:cancel
refund:create
rx:read rx:verify
customer:read customer:write
staff:read staff:write
branch:read branch:write
role:read role:write
report:read audit:read
phi:view            # explicit, heavily audited
```

### Roles (bundles of permissions) — illustrative

| Role             | Key permissions                                                               | Branch scope        |
| ---------------- | ----------------------------------------------------------------------------- | ------------------- |
| `SUPPORT`        | order:read, customer:read, rx:read                                            | assigned branches   |
| `PHARMACIST`     | rx:read, **rx:verify**, phi:view, order:read/transition, inventory:read       | assigned branch(es) |
| `BRANCH_MANAGER` | catalog:read, inventory:_, order:_, refund:create, customer:read, report:read | assigned branch(es) |
| `ADMIN`          | most write perms, staff:write, branch:write, report:read, audit:read          | ALL or set          |
| `SUPER_ADMIN`    | all incl. role:write                                                          | ALL                 |

Roles are data (`roles` collection), so new roles/bundles can be created without code
changes. **`rx:verify` can only be held by staff with a valid, in-date PCN license** —
enforced at assignment time **and** at action time.

---

## 6. Branch-scoped authorization (core to "branch-first")

Every staff action carries an implicit branch context. A guard verifies:

```
canAct = hasPermission(user, requiredPermission)
         AND ( user.branchScope === "ALL"
               OR targetBranchId ∈ user.branchScope )
```

- `targetBranchId` comes from the **resource** (e.g. the order's `branchId`), not just a
  client header — a branch manager cannot act on another branch's order by spoofing a
  header.
- Cross-branch reads/reports require `ALL` scope or explicit grant.
- The customer realm has no branch authority; customers only access **their own**
  resources (ownership check: `resource.customerId === user.sub`).

---

## 7. Enforcement mechanics (NestJS)

```
Request → AuthGuard (verify JWT, realm, session active)
        → PermissionGuard (@RequirePermission('rx:verify'))
        → BranchScopeGuard (resolves targetBranchId, checks scope)
        → handler
        → AuditInterceptor (records actor, action, target, branch, trace)
```

- Declarative decorators on controllers: `@RequirePermission('refund:create')`,
  `@BranchScoped('order')`.
- Ownership for customer endpoints via an `@Owns()` guard.
- High-risk endpoints additionally call a `PolicyService` for DB-backed re-validation +
  optional step-up MFA.

---

## 8. Sensitive-data access (PHI)

- Viewing a prescription image issues a **short-lived signed URL** and writes a
  `phi.view` audit entry (who, which Rx, when, IP).
- `phi:view` is a distinct permission; not every staff role has it.
- PHI is encrypted at rest (object store + DB field-level where applicable) and in
  transit (TLS everywhere).

---

## 9. Account & credential security

| Control          | Detail                                                                   |
| ---------------- | ------------------------------------------------------------------------ |
| Password hashing | Argon2id (memory-hard)                                                   |
| Brute force      | Progressive lockout + rate limiting on login/OTP                         |
| Token signing    | Asymmetric keys, rotated; old keys honored during overlap                |
| Session hygiene  | TTL expiry, device list, revoke-all, refresh rotation w/ reuse detection |
| Enumeration      | Uniform responses on login/OTP/forgot-password                           |
| Secrets          | Central secrets manager; never in repo or images                         |
| Transport        | HTTPS only, HSTS, secure cookies, CSP on web apps                        |
| Admin surface    | Separate app/domain; optional IP allow-listing; mandatory MFA            |

---

## 10. Authorization decision examples

| Actor                     | Action                    | Allowed?                       |
| ------------------------- | ------------------------- | ------------------------------ |
| Customer A                | `GET /orders/{B's order}` | ❌ 404 (ownership)             |
| Branch manager (Ago)      | refund own-branch order   | ✅ if `refund:create`          |
| Branch manager (Ago)      | refund other-branch order | ❌ 403 (branch scope)          |
| Pharmacist w/ expired PCN | `rx:verify`               | ❌ 403 (license invalid)       |
| Support agent             | `phi:view` Rx image       | ❌ 403 unless granted          |
| Admin (scope ALL)         | view cross-branch report  | ✅                             |
| Customer token            | any `/admin/*`            | ❌ 401/403 (wrong realm `aud`) |
