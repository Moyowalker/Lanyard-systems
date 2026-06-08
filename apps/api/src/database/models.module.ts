import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import {
  Customer,
  CustomerSchema,
  StaffUser,
  StaffUserSchema,
  Session,
  SessionSchema,
  OtpChallenge,
  OtpChallengeSchema,
} from '../modules/identity/infrastructure/identity.schemas';
import {
  Permission,
  PermissionSchema,
  Role,
  RoleSchema,
} from '../modules/authz/infrastructure/authz.schemas';
import { Branch, BranchSchema } from '../modules/branch/infrastructure/branch.schema';
import {
  Category,
  CategorySchema,
  Product,
  ProductSchema,
} from '../modules/catalog/infrastructure/catalog.schemas';
import { PriceList, PriceListSchema } from '../modules/pricing/infrastructure/price-list.schema';
import {
  InventoryItem,
  InventoryItemSchema,
  StockMovement,
  StockMovementSchema,
} from '../modules/inventory/infrastructure/inventory.schemas';
import {
  Prescription,
  PrescriptionSchema,
} from '../modules/prescription/infrastructure/prescription.schema';
import { Cart, CartSchema } from '../modules/cart/infrastructure/cart.schema';
import { Order, OrderSchema } from '../modules/order/infrastructure/order.schema';
import {
  PaymentIntent,
  PaymentIntentSchema,
  PaymentTransaction,
  PaymentTransactionSchema,
  Refund,
  RefundSchema,
} from '../modules/payment/infrastructure/payment.schemas';
import { Delivery, DeliverySchema } from '../modules/delivery/infrastructure/delivery.schema';
import {
  Notification,
  NotificationSchema,
} from '../modules/notification/infrastructure/notification.schema';
import {
  ContentBlock,
  ContentBlockSchema,
  BlogPost,
  BlogPostSchema,
  Promotion,
  PromotionSchema,
  Lead,
  LeadSchema,
} from '../modules/content/infrastructure/content.schemas';
import {
  AuditLog,
  AuditLogSchema,
  OutboxEvent,
  OutboxEventSchema,
  IdempotencyKey,
  IdempotencyKeySchema,
} from './platform.schemas';

/**
 * Registers every Mongoose model and re-exports MongooseModule so any feature
 * module can inject the models it needs via @InjectModel.
 *
 * Phase-0 convenience: models are registered centrally here. As domain modules
 * gain their own services, each can move its `forFeature(...)` registration into
 * its own module (see docs/architecture/03) — this file is the single switchboard
 * until then.
 */
const MODELS = [
  { name: Customer.name, schema: CustomerSchema },
  { name: StaffUser.name, schema: StaffUserSchema },
  { name: Session.name, schema: SessionSchema },
  { name: OtpChallenge.name, schema: OtpChallengeSchema },
  { name: Permission.name, schema: PermissionSchema },
  { name: Role.name, schema: RoleSchema },
  { name: Branch.name, schema: BranchSchema },
  { name: Category.name, schema: CategorySchema },
  { name: Product.name, schema: ProductSchema },
  { name: PriceList.name, schema: PriceListSchema },
  { name: InventoryItem.name, schema: InventoryItemSchema },
  { name: StockMovement.name, schema: StockMovementSchema },
  { name: Prescription.name, schema: PrescriptionSchema },
  { name: Cart.name, schema: CartSchema },
  { name: Order.name, schema: OrderSchema },
  { name: PaymentIntent.name, schema: PaymentIntentSchema },
  { name: PaymentTransaction.name, schema: PaymentTransactionSchema },
  { name: Refund.name, schema: RefundSchema },
  { name: Delivery.name, schema: DeliverySchema },
  { name: Notification.name, schema: NotificationSchema },
  { name: ContentBlock.name, schema: ContentBlockSchema },
  { name: BlogPost.name, schema: BlogPostSchema },
  { name: Promotion.name, schema: PromotionSchema },
  { name: Lead.name, schema: LeadSchema },
  { name: AuditLog.name, schema: AuditLogSchema },
  { name: OutboxEvent.name, schema: OutboxEventSchema },
  { name: IdempotencyKey.name, schema: IdempotencyKeySchema },
];

@Global()
@Module({
  imports: [MongooseModule.forFeature(MODELS)],
  exports: [MongooseModule],
})
export class ModelsModule {}
