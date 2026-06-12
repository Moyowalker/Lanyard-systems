# 12 — Compliance Readiness Checklist

This checklist turns the compliance launch gate in [09](09-mvp-definition.md#4-definition-of-done-mvp-wide)
and the security/compliance items in [10](10-risks-mitigation.md#3-pre-launch-readiness-checklist)
into a concrete go-live checklist mapped to the platform as implemented today.

It is written for engineering, operations, and compliance reviewers. It is not legal
advice; it is the implementation-facing evidence list for launch readiness.

---

## 1. Status legend

| Status        | Meaning                                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `implemented` | The platform already enforces this control in code.                                                                                                                             |
| `manual`      | The data model or workflow exists, but launch still depends on manual review or documented operational evidence.                                                                |
| `gap`         | The architecture expects this control, but the current implementation does not fully enforce it yet. Close it before broad go-live or treat it as a named manual approval gate. |

---

## 2. Current readiness snapshot

| Domain                               | Platform mapping                                                                                                                                                                                                                                                                                                                                                                                                                 | Current state    |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| PCN premises linkage                 | Branch records store `license.pcnPremisesNo` and `license.superintendentStaffId` in [branch.schema.ts](../../apps/api/src/modules/branch/infrastructure/branch.schema.ts) and [branch.service.ts](../../apps/api/src/modules/branch/application/branch.service.ts).                                                                                                                                                              | `manual`         |
| Superintendent pharmacist validation | Prescription verification checks in-date PCN license in [prescription.service.ts](../../apps/api/src/modules/prescription/application/prescription.service.ts), but branch linkage only validates “pharmacist”, not “in-date superintendent”.                                                                                                                                                                                    | `manual` + `gap` |
| NDPA consent and retention           | Consent model exists in [schema.helpers.ts](../../apps/api/src/database/schema.helpers.ts); PHI access is signed-URL + audited; TTL exists for short-lived data. Customer registration currently captures `marketingConsent`, not explicit `phiProcessing`, in [auth.ts](../../packages/contracts/src/schemas/auth.ts) and [customer-auth.service.ts](../../apps/api/src/modules/identity/application/customer-auth.service.ts). | `manual` + `gap` |
| NAFDAC metadata completeness         | Product master supports `regulatoryClass`, `nafdacRegNo`, `manufacturer`, `requiresPrescription`, and `isControlled` in [catalog.schemas.ts](../../apps/api/src/modules/catalog/infrastructure/catalog.schemas.ts), but publish-time completeness is not enforced in [catalog.ts](../../packages/contracts/src/schemas/catalog.ts).                                                                                              | `manual` + `gap` |

Launch should be treated as **not fully green** until every `gap` item below is either
implemented or explicitly handled as a manual sign-off control with a named owner.

---

## 3. PCN premises linkage

**Mapped implementation**

- Branch records require `license.pcnPremisesNo` and `license.superintendentStaffId` in [branch.schema.ts](../../apps/api/src/modules/branch/infrastructure/branch.schema.ts).
- Branch create/update flows write these fields in [branch.service.ts](../../apps/api/src/modules/branch/application/branch.service.ts).
- Seed data already models the intended shape with a superintendent-backed active branch in [seed.ts](../../apps/api/src/database/seed.ts).

| Checklist item                                                                                                 | Platform mapping                                                                                   | Evidence required at go-live                                                                                              | Status   |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------- |
| Every branch included in launch has `license.pcnPremisesNo` populated.                                         | Branch data model and admin branch workflow.                                                       | Export or screenshot of each launch branch record plus the source PCN premises certificate.                               | `manual` |
| Every launch branch links to the correct superintendent staff account via `license.superintendentStaffId`.     | Branch create/update persists superintendent linkage.                                              | Branch-to-staff mapping signed off by compliance/ops.                                                                     | `manual` |
| Branch address, name, and contact fields match the licensed premises documents.                                | Branch master data in `branches`.                                                                  | Reviewed branch master-data pack per launch branch.                                                                       | `manual` |
| No branch is marked `active` until compliance has reviewed the premises certificate and linked superintendent. | Branch records support status and license fields.                                                  | Manual approval step in launch runbook.                                                                                   | `manual` |
| Branch activation is hard-blocked when the linked superintendent is expired or not actually a superintendent.  | Architecture expects this; current `assertSuperintendent()` only checks `staff.pharmacist` exists. | Implement service-level enforcement, or keep branch activation under explicit compliance approval until that code exists. | `gap`    |

---

## 4. Superintendent pharmacist validation

**Mapped implementation**

- Staff pharmacist profiles carry `pcnLicenseNo`, `licenseExpiry`, and `isSuperintendent` in [identity.schemas.ts](../../apps/api/src/modules/identity/infrastructure/identity.schemas.ts).
- Prescription verification is already hard-gated by an in-date PCN license in [prescription.service.ts](../../apps/api/src/modules/prescription/application/prescription.service.ts).
- Verification events are audited with the pharmacist’s PCN license number.
- There is an index on `pharmacist.licenseExpiry`, but no surfaced alerting/job was found in the implemented platform.

| Checklist item                                                                                                      | Platform mapping                                                | Evidence required at go-live                                    | Status                   |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------ |
| Every staff user who can verify prescriptions has a populated `pharmacist.pcnLicenseNo` and future `licenseExpiry`. | `PrescriptionService.verify()` blocks missing/expired licenses. | Staff export reviewed against source PCN documents.             | `implemented` + `manual` |
| Each branch superintendent has `pharmacist.isSuperintendent = true`.                                                | Staff schema supports the flag.                                 | Reviewed superintendent roster per active branch.               | `manual`                 |
| A staging negative test proves an expired-license pharmacist cannot verify a prescription.                          | Rx verification hard-gate in code.                              | Recorded test evidence from staging or automated test evidence. | `implemented`            |
| At least one staged `rx.verify` action is retained as audit evidence showing the verifying PCN license number.      | Audit metadata includes `pcnLicenseNo`.                         | Audit log export for compliance pack.                           | `implemented` + `manual` |
| A recurring review owner exists for upcoming `licenseExpiry` dates until automatic expiry alerts are implemented.   | Expiry data is stored and indexed only.                         | Named owner and review cadence in runbook.                      | `gap`                    |
| Branch linkage validates superintendent status (`isSuperintendent`) in addition to pharmacist status.               | Not enforced in current branch service.                         | Implement validation or hold as manual control.                 | `gap`                    |

---

## 5. NDPA consent and retention

**Mapped implementation**

- Consent is modeled as `phiProcessing`, `marketing`, `version`, and `at` in [schema.helpers.ts](../../apps/api/src/database/schema.helpers.ts).
- Customer records embed consent in [identity.schemas.ts](../../apps/api/src/modules/identity/infrastructure/identity.schemas.ts).
- The implemented registration flow currently captures only `marketingConsent` in [auth.ts](../../packages/contracts/src/schemas/auth.ts) and [customer-auth.service.ts](../../apps/api/src/modules/identity/application/customer-auth.service.ts).
- PHI access is delivered via signed URLs and audited through `phi.view` actions in [prescription.service.ts](../../apps/api/src/modules/prescription/application/prescription.service.ts).
- Short-lived data (`sessions`, `otp_challenges`, `carts`, idempotency keys) already uses TTL cleanup; long-lived retention remains documented policy in [05](05-database-schema.md#12-data-lifecycle--retention-ndpa-aligned).

| Checklist item                                                                                                                      | Platform mapping                                                                                             | Evidence required at go-live                                                                                      | Status                   |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------ |
| The production privacy notice / consent text is approved and versioned.                                                             | Consent model stores `version` + timestamp.                                                                  | Final approved policy version string recorded for launch.                                                         | `manual`                 |
| Customers explicitly consent to PHI processing before prescription upload or other PHI-heavy flows begin.                           | Consent model supports `phiProcessing`, but the implemented customer registration path does not populate it. | Implement explicit PHI-processing consent in the live onboarding/upload path or block those flows until captured. | `gap`                    |
| Marketing consent remains separate and optional from PHI-processing consent.                                                        | Current customer registration stores `marketingConsent` separately.                                          | Product/legal review of UI copy and data mapping.                                                                 | `implemented` + `manual` |
| Staff PHI access uses signed URLs and is audited.                                                                                   | `phi.view` audit + signed file URL issuance in prescription service.                                         | Staging test evidence showing access event + audit trail.                                                         | `implemented`            |
| Retention windows are approved for prescriptions, orders/payment transactions, audit logs, OTP/sessions/carts, and marketing leads. | Retention intent is documented in [05](05-database-schema.md#12-data-lifecycle--retention-ndpa-aligned).     | Compliance-approved retention schedule attached to launch packet.                                                 | `manual`                 |
| Data-subject access/deletion handling is documented and rehearsed, including legal-hold exceptions for PHI and financial records.   | Architecture docs mention support; no explicit implemented API/runbook flow was located in the current code. | Written runbook + dry-run before launch.                                                                          | `gap`                    |
| Long-lived retention/destruction responsibilities are assigned until lifecycle automation exists.                                   | Only short-lived TTL cleanup is currently implemented automatically.                                         | Named owner for periodic review/export/purge decisions.                                                           | `gap`                    |

---

## 6. NAFDAC product metadata completeness

**Mapped implementation**

- Global product master stores `regulatoryClass`, `nafdacRegNo`, `manufacturer`, and derived `requiresPrescription` / `isControlled` in [catalog.schemas.ts](../../apps/api/src/modules/catalog/infrastructure/catalog.schemas.ts).
- Admin create/update flows preserve those fields in [catalog.service.ts](../../apps/api/src/modules/catalog/application/catalog.service.ts).
- Product write schemas in [catalog.ts](../../packages/contracts/src/schemas/catalog.ts) do **not** currently require `nafdacRegNo` or `manufacturer` before a product can be published.
- Inventory supports per-branch batch/expiry tracking in [inventory.schemas.ts](../../apps/api/src/modules/inventory/infrastructure/inventory.schemas.ts), which is relevant for recall traceability.

| Checklist item                                                                                                                           | Platform mapping                                                    | Evidence required at go-live                                                   | Status                   |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------ |
| Every published medicine has the correct `regulatoryClass` (`OTC`, `POM`, or `CONTROLLED`).                                              | Product master stores regulatory class; read models expose it.      | Pre-launch published catalog review signed by product + pharmacist/compliance. | `manual`                 |
| Every published product that requires NAFDAC registration has `nafdacRegNo` populated and source-verified.                               | Field exists in product schema but is optional in write validation. | Catalog QA export cross-checked against source regulatory documents.           | `manual` + `gap`         |
| Every published regulated medicine has `manufacturer` completed.                                                                         | Field exists but is optional.                                       | Catalog QA export.                                                             | `manual` + `gap`         |
| Controlled medicines are tagged with `RegulatoryClass.CONTROLLED`, resulting in `requiresPrescription = true` and `isControlled = true`. | Derived flags are enforced in product save/update logic.            | Staging spot-check of controlled SKUs.                                         | `implemented` + `manual` |
| Inventory records for launch medicines include batch and expiry details where operationally required for recall/traceability.            | Inventory item batches are modeled per branch.                      | Inventory review for launch branches.                                          | `manual`                 |
| Publish-time validation blocks incomplete regulatory metadata for regulated products.                                                    | Not enforced in current create/update schemas.                      | Implement schema/service validation or keep a manual catalog release gate.     | `gap`                    |

---

## 7. Minimum sign-off package before go-live

The compliance sign-off packet should contain at least:

1. Launch-branch list with PCN premises numbers and linked superintendent staff IDs.
2. Superintendent/pharmacist license roster with PCN numbers and expiry dates.
3. Evidence of one staged prescription verification and one staged PHI-access audit trail.
4. Final privacy notice version, explicit NDPA consent capture decision, and retention schedule.
5. Published catalog export with `regulatoryClass`, `nafdacRegNo`, `manufacturer`, and controlled-item review.
6. A written list of open `gap` items above with owners, due dates, and the temporary manual control used at launch.

If any `gap` item is left unresolved, launch approval should name the compensating control,
the owner, and the review date explicitly.
