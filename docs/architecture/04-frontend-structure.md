# 04 — Frontend Application Structure

Three Next.js applications, one shared design system and API client. Each app is
stateless and horizontally scalable; all business logic lives in the API.

---

## 1. Why three apps (not one)

| Reason                  | Detail                                                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Security isolation**  | Staff console (`web-admin`) and customer store have different threat models, auth realms, and bundles. They never share client code or cookies. |
| **Performance/SEO**     | Marketing is SSG/ISR-first for SEO; store is SSR+CSR; admin is an auth-gated SPA-like CSR app. Different rendering strategies.                  |
| **Independent deploys** | A marketing copy change shouldn't risk the checkout flow.                                                                                       |
| **Blast radius**        | A vulnerability or bad deploy in one surface is contained.                                                                                      |

They share **`packages/ui`** (design system) and **`packages/api-client`** so we don't
duplicate components or types.

---

## 2. Rendering strategy per app

| App             | Strategy                                                              | Reason                                              |
| --------------- | --------------------------------------------------------------------- | --------------------------------------------------- |
| `web-marketing` | **SSG + ISR**, edge-cached                                            | Max SEO + speed; content changes infrequently       |
| `web-store`     | **SSR** for catalog/PDP (SEO + freshness) + **CSR** for cart/checkout | Indexable products, dynamic per-branch availability |
| `web-admin`     | **CSR** behind auth (minimal SSR)                                     | Internal tool; data is private, no SEO needed       |

All use the **Next.js App Router**, React Server Components where they help, and
Server Actions only for trusted server-side calls (never to bypass the API contract).

---

## 3. Shared `web-store` structure (representative)

```
apps/web-store/
├── app/
│   ├── (marketing-bridge)/         # landing → store handoff
│   ├── (shop)/
│   │   ├── page.tsx                # home / catalog entry
│   │   ├── branch/                 # branch selection
│   │   ├── category/[slug]/
│   │   ├── product/[slug]/         # PDP (SSR)
│   │   └── search/
│   ├── (account)/
│   │   ├── login/  register/  verify-otp/
│   │   ├── profile/  addresses/  orders/  orders/[id]/
│   │   └── prescriptions/
│   ├── (checkout)/
│   │   ├── cart/
│   │   ├── checkout/               # address, fulfillment, Rx link
│   │   ├── payment/                # provider redirect/inline
│   │   └── confirmation/[orderId]/
│   ├── api/                        # route handlers: BFF-only (cookies, webhooks-relay)
│   ├── layout.tsx
│   └── error.tsx / not-found.tsx
│
├── features/                       # feature-sliced: each owns ui+hooks+state+api calls
│   ├── catalog/  cart/  checkout/  prescription/  orders/  auth/  branch/
│
├── components/                     # app-specific compos;  primitives come from @lanyard/ui
├── lib/
│   ├── api.ts                      # configured @lanyard/api-client instance
│   ├── auth.ts                     # session/cookie helpers (httpOnly)
│   ├── query.ts                    # React Query client config
│   └── analytics.ts
├── hooks/
├── styles/                         # tailwind entry; tokens from @lanyard/config
└── middleware.ts                   # route protection, branch cookie, locale
```

**Feature-sliced design:** UI is organized by **feature** (catalog, checkout, …), each a
self-contained slice. This scales far better than a flat `components/` folder and mirrors
the backend's module boundaries.

---

## 4. State management

| Kind of state                                      | Tool                                                          | Notes                                              |
| -------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------- |
| **Server state** (catalog, orders, cart from API)  | **TanStack Query (React Query)**                              | Caching, revalidation, optimistic updates, retries |
| **Client/UI state** (modals, wizard step, filters) | **Zustand** (light) or React state                            | No heavy global store needed                       |
| **Form state**                                     | **React Hook Form + zod** (schemas from `@lanyard/contracts`) | Same validation rules as the backend               |
| **Auth/session**                                   | httpOnly cookies + server middleware                          | No tokens in `localStorage`                        |

Principle: **the server is the source of truth.** We avoid duplicating server state into a
global client store; React Query owns it.

---

## 5. `packages/ui` — the design system

```
packages/ui/
├── primitives/      # Button, Input, Select, Dialog, Toast (Radix-based, accessible)
├── patterns/        # ProductCard, PriceTag, RxBadge, OrderStatusStepper, BranchPicker
├── layout/          # Page shells, nav, grids
├── theme/           # Tailwind tokens, color system, typography, dark mode
└── icons/
```

- Built on **Radix UI primitives + TailwindCSS** for accessibility + speed.
- Shared by all three apps → consistent brand, one place to fix a11y/styling.
- **Accessibility is a requirement, not a nicety** — healthcare audiences include
  low-vision and older users (WCAG 2.1 AA target).

---

## 6. The admin app (`web-admin`) shape

```
apps/web-admin/app/
├── (auth)/login  verify-mfa
├── dashboard/                  # branch-scoped KPIs
├── orders/        [id]/        # manage, fulfill, refund
├── prescriptions/ [id]/        # VERIFY workflow (pharmacist) — most sensitive screen
├── catalog/  products/ categories/
├── inventory/     adjustments/ batches/
├── customers/     [id]/
├── staff/         roles/        # admin only
├── branches/                    # admin only
├── promotions/
├── reports/
└── audit-log/                   # read-only, filterable
```

- Every screen is **branch-scoped by the user's role**; a branch manager sees only their
  branch(es). Admins can switch branch context.
- The **prescription verification** screen is the regulatory crown jewel: shows the Rx
  image (via signed URL), the requested items, the customer, and a guarded
  Verify/Reject action that records the pharmacist's identity and license.
- All actions surface clear, audited confirmations.

---

## 7. Cross-cutting frontend concerns

| Concern                      | Approach                                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| **Auth/route protection**    | `middleware.ts` checks session cookie; role gates per route group                             |
| **Error handling**           | Error boundaries + canonical error codes from `@lanyard/contracts` → friendly messages        |
| **Loading/UX**               | Skeletons, optimistic cart, suspense boundaries                                               |
| **i18n / locale**            | English first; structure ready for additional locales                                         |
| **Analytics**                | GA4/consent-gated events on key funnels (marketing + store)                                   |
| **SEO**                      | Metadata API, structured data (Product, Pharmacy/LocalBusiness), sitemaps (marketing + store) |
| **Performance**              | Image optimization, route-level code splitting, edge caching, Core Web Vitals budget          |
| **Resilience (NG networks)** | Optimistic UI, retry/backoff in api-client, graceful offline messaging, lean bundles          |
| **Security**                 | No secrets in client; CSP headers; httpOnly cookies; sanitize any user/Rx content             |

---

## 8. Mobile-app readiness

We never paint ourselves into a corner:

- All data flows through the **versioned REST API** + typed `api-client`.
- `contracts` is framework-free → reusable by a future **React Native / Expo** app.
- Auth uses standard OTP + token flows a mobile client can adopt.
- No business logic leaks into web frontends, so a mobile app reaches feature parity by
  consuming the same endpoints.

---

## 9. Frontend testing

| Level            | Tooling                                                                       |
| ---------------- | ----------------------------------------------------------------------------- |
| Unit / component | Vitest + React Testing Library                                                |
| Visual / a11y    | Storybook + axe checks on `packages/ui`                                       |
| E2E              | Playwright on critical journeys (browse → Rx upload → checkout → pay → track) |
| Contract         | Types from `contracts`; api-client drift check in CI                          |
