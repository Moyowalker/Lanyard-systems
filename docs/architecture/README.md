# Lanyard Pharmacy — Digital Commerce Platform Architecture

> **Status:** Living architecture record aligned with the current monorepo; implementation is in progress
> **Owner:** Platform Engineering (CTO/Lead Architect)
> **Audience:** Engineering, Product, Compliance, Operations leadership
> **Last updated:** 2026-06-06

This directory is the **canonical architecture record** for the Lanyard Pharmacy
Digital Commerce Platform. It is written to be production-grade for a **regulated
healthcare commerce** business operating in Nigeria.

---

## 1. What we are building

A **Digital Pharmacy Commerce Ecosystem** — four interconnected systems sharing one
platform engine:

| #   | System                     | Primary users                          | Deployable unit                 |
| --- | -------------------------- | -------------------------------------- | ------------------------------- |
| 1   | Marketing Website          | Public, prospects                      | `web-marketing` (Next.js)       |
| 2   | Customer Commerce Platform | Patients / buyers                      | `web-store` (Next.js)           |
| 3   | Staff Operations Platform  | Pharmacists, managers, admins, support | `web-admin` (Next.js)           |
| 4   | Platform Engine            | All of the above (API)                 | `api` (NestJS modular monolith) |

This is **not** a website. It is a transactional, audited, compliance-sensitive
platform handling **money, medicines, and protected health information (PHI)**.

---

## 2. Reading order

| Doc                               | Title                          | Read if you care about…                      |
| --------------------------------- | ------------------------------ | -------------------------------------------- |
| [01](01-system-architecture.md)   | System Architecture            | How the whole thing fits together            |
| [02](02-repository-structure.md)  | Repository Structure           | Monorepo layout, shared packages             |
| [03](03-backend-module-design.md) | Backend Module Design          | NestJS modules, boundaries, lifecycle        |
| [04](04-frontend-structure.md)    | Frontend Application Structure | Next.js apps, shared UI, state               |
| [05](05-database-schema.md)       | Database Schema Design         | MongoDB collections, indexes, branch scoping |
| [06](06-api-design.md)            | API Design                     | REST conventions, key endpoints, errors      |
| [07](07-auth-rbac.md)             | Authentication & RBAC          | Tokens, roles, branch-scoped authz           |
| [08](08-infrastructure.md)        | Infrastructure Architecture    | Docker, CI/CD, environments, observability   |
| [09](09-mvp-definition.md)        | MVP Definition                 | What ships first, and what does not          |
| [10](10-risks-mitigation.md)      | Engineering Risks & Mitigation | What can hurt us and the plan                |
| [11](11-render-readiness.md)      | Render Readiness               | Backend validation status, Render setup, Swagger URLs |
| [12](12-compliance-readiness.md)  | Compliance Readiness           | Go-live checklist for PCN, NDPA, and NAFDAC controls |

---

## 3. Foundational architecture decisions (the short version)

These are the load-bearing decisions. Each is justified in the linked docs.

| #     | Decision        | Choice                                           | Why (one line)                                       |
| ----- | --------------- | ------------------------------------------------ | ---------------------------------------------------- |
| AD-01 | Repo strategy   | **Monorepo** (pnpm + Nx)                         | Shared TS types/contracts between apps; one CI graph |
| AD-02 | Backend style   | **Modular monolith** (not microservices)         | Small team, transactional consistency, split later   |
| AD-03 | Branch model    | **Branch-first scoping** (`branchId` everywhere) | Inventory, pricing, fulfillment are per-branch       |
| AD-04 | Identity realms | **Separate customer & staff identity realms**    | Different lifecycles, risk profiles, MFA needs       |
| AD-05 | Order engine    | **Explicit state machine** with Rx gating        | Pharmacist verification is a regulatory hard-stop    |
| AD-06 | Payments        | **Provider-abstracted, webhook-verified**        | Never trust client; swap Paystack/Flutterwave        |
| AD-07 | Async work      | **BullMQ + Redis** queues                        | Notifications, reconciliation, reports, scans        |
| AD-08 | Audit           | **Append-only immutable audit log**              | Regulatory + security + dispute resolution           |
| AD-09 | PHI storage     | **Encrypted object store + signed URLs**         | Prescriptions are sensitive personal data            |
| AD-10 | API contract    | **API-first, OpenAPI-generated client**          | One source of truth; mobile-app ready                |

---

## 4. Regulatory & compliance framing (Nigeria)

This is what makes us a **healthcare** platform, not a generic store. It is woven
into the architecture, not bolted on. See [10-risks-mitigation.md](10-risks-mitigation.md)
for the full register.

- **PCN (Pharmacists Council of Nigeria):** Premises and superintendent pharmacist
  must be licensed. **Prescription-Only Medicines (POM) may only be dispensed under a
  registered pharmacist's authorization.** → The order lifecycle has a mandatory
  pharmacist verification gate for Rx items.
- **NAFDAC:** Products must be registered; controlled substances are restricted.
  → Catalog carries `regulatoryClass`, `nafdacRegNo`, `isControlled`.
- **NDPA 2023 / NDPR (Nigeria Data Protection Act/Regulation):** Health data is
  **sensitive personal data**. → Consent, data minimization, encryption, retention
  policies, audited access, and breach procedures are first-class requirements.
- **Payments (CBN/PCI posture):** We never store raw card data; tokenized,
  provider-hosted payment collection only.

---

## 5. How to evolve these documents

- Architecture changes go through a lightweight **ADR** (Architecture Decision Record)
  appended to the relevant doc, dated, with context → decision → consequences.
- The **MVP scope** ([09](09-mvp-definition.md)) is a contract with Product. Scope
  changes are explicit, not implicit.
- Some documents describe target-state architecture while others now capture validated
  implementation status. Use [11](11-render-readiness.md) when you need the current
  backend readiness snapshot.
