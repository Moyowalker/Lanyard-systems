# Database Schemas — Conventions & Map

Production Mongoose schemas (NestJS `@nestjs/mongoose` decorator style) for every
collection in [docs/architecture/05-database-schema.md](../../../../docs/architecture/05-database-schema.md).

> **Drop-in note:** these files are written to land in `apps/api/src` once the workspace
> is scaffolded (Phase 0). They depend on:
>
> - `@lanyard/contracts` — enums (created here under `packages/contracts/src/enums`).
> - `@nestjs/mongoose`, `mongoose` — runtime deps installed in `apps/api`.
>   Until `pnpm install` + tsconfig path aliases exist, imports won't resolve — expected.

---

## Conventions (applied to every schema)

| Rule                                     | How                                                                                                                           |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **One collection = one `@Schema` class** | Explicit `collection: 'snake_plural'` matching doc 05                                                                         |
| **Timestamps**                           | `timestamps: true` → `createdAt`/`updatedAt` automatic                                                                        |
| **No `__v`**                             | `versionKey: false` via shared `baseSchemaOptions`                                                                            |
| **`id` not `_id` in JSON**               | `toJSON` transform exposes `id`, strips `_id`                                                                                 |
| **Money**                                | Integer **kobo** (`Number.isInteger`, `min: 0`) via shared `KOBO` prop + `currency` enum at aggregate level — never floats    |
| **References**                           | `Types.ObjectId` + `ref` for shared/unbounded relations; **embed** snapshots/value-objects                                    |
| **Sensitive fields**                     | `select: false` + stripped in `toJSON` (`passwordHash`, `mfaSecretRef`, `refreshTokenHash`, `codeHash`, `rawProviderPayload`) |
| **Validation at the schema**             | `required`, `min/max`, `match`, `enum`, `maxlength`, custom validators (E.164 phone, kobo)                                    |
| **Indexes with the schema**              | Declared via `Schema.index(...)`; compound indexes follow **ESR** (Equality→Sort→Range)                                       |
| **TTL**                                  | `expiresAt` + `{ expireAfterSeconds: 0 }` on sessions, OTPs, carts, idempotency keys                                          |
| **Append-only collections**              | `immutableGuard()` blocks app-level update/delete (audit, stock movements, payment txns, outbox)                              |
| **Soft delete**                          | `deletedAt?: Date` where doc 05 marks soft-deletable                                                                          |
| **Geo**                                  | GeoJSON `Point` (`[lng, lat]`) + `2dsphere` (refines doc 05's `{lat,lng}` so the index works)                                 |

---

## File map

| File                                                         | Collections                                                       |
| ------------------------------------------------------------ | ----------------------------------------------------------------- |
| `../../../packages/contracts/src/enums/index.ts`             | all shared enums                                                  |
| `database/schema.helpers.ts`                                 | shared options, `KOBO`, `Address`, `GeoPoint`, guards, validators |
| `modules/identity/infrastructure/identity.schemas.ts`        | `customers`, `staff_users`, `sessions`, `otp_challenges`          |
| `modules/authz/infrastructure/authz.schemas.ts`              | `roles`, `permissions`                                            |
| `modules/branch/infrastructure/branch.schema.ts`             | `branches`                                                        |
| `modules/catalog/infrastructure/catalog.schemas.ts`          | `categories`, `products`                                          |
| `modules/pricing/infrastructure/price-list.schema.ts`        | `price_lists`                                                     |
| `modules/inventory/infrastructure/inventory.schemas.ts`      | `inventory_items`, `stock_movements`                              |
| `modules/prescription/infrastructure/prescription.schema.ts` | `prescriptions`                                                   |
| `modules/cart/infrastructure/cart.schema.ts`                 | `carts`                                                           |
| `modules/order/infrastructure/order.schema.ts`               | `orders`                                                          |
| `modules/payment/infrastructure/payment.schemas.ts`          | `payment_intents`, `payment_txns`, `refunds`                      |
| `modules/delivery/infrastructure/delivery.schema.ts`         | `deliveries`                                                      |
| `modules/notification/infrastructure/notification.schema.ts` | `notifications`                                                   |
| `modules/content/infrastructure/content.schemas.ts`          | `content_blocks`, `blog_posts`, `promotions`, `leads`             |
| `database/platform.schemas.ts`                               | `audit_logs`, `outbox_events`, `idempotency_keys`                 |

---

## Registering schemas (per NestJS module)

```ts
// e.g. order.module.ts
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from './infrastructure/order.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }])],
})
export class OrderModule {}
```

Transactions (order-paid, dispense, refund) use a Mongoose `ClientSession` started from
the connection and passed to repository calls — see doc 05 §10.
