import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  Currency,
  FulfillmentType,
  OrderPaymentStatus,
  OrderStatus,
  ProductForm,
  RoleKey,
} from '@lanyard/contracts';
import {
  baseSchemaOptions,
  KOBO,
  OPTIONAL_KOBO,
  CURRENCY_PROP,
  Address,
  AddressSchema,
} from '../../../database/schema.helpers';

/* ════════════════════════════════════════════════════════════════════════
 * orders — the transactional core. Governed by an explicit state machine
 * (doc 03 §4). Line items and address are IMMUTABLE SNAPSHOTS so historical
 * orders never change when the catalog/customer does.
 * ════════════════════════════════════════════════════════════════════════ */

export type OrderDocument = HydratedDocument<Order>;

/** Immutable snapshot of a purchased line at order-creation time. */
@Schema({ _id: false })
export class OrderItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId: Types.ObjectId;

  @Prop({ required: true }) name: string; // snapshot
  @Prop({ type: String, enum: ProductForm }) form?: ProductForm; // snapshot
  @Prop({ type: String }) strength?: string; // snapshot

  @Prop(KOBO) unitPriceKobo: number;
  @Prop({ type: Number, required: true, min: 1 }) quantity: number;
  @Prop(KOBO) lineTotalKobo: number;

  @Prop({ type: Boolean, default: false }) requiresPrescription: boolean;
}
export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

@Schema({ _id: false })
export class OrderTotals {
  @Prop(KOBO) subtotalKobo: number;
  @Prop(KOBO) discountKobo: number;
  @Prop(KOBO) deliveryKobo: number;
  @Prop(KOBO) totalKobo: number;
  @Prop(CURRENCY_PROP) currency: Currency;
}
export const OrderTotalsSchema = SchemaFactory.createForClass(OrderTotals);

@Schema({ _id: false })
export class OrderFulfillment {
  @Prop({ type: String, enum: FulfillmentType, required: true })
  type: FulfillmentType;

  @Prop({ type: AddressSchema })
  address?: Address; // snapshot for delivery

  @Prop(OPTIONAL_KOBO) feeKobo?: number;
  @Prop({ type: Number, min: 0 }) etaMins?: number;
}
export const OrderFulfillmentSchema = SchemaFactory.createForClass(OrderFulfillment);

@Schema({ _id: false })
export class OrderPayment {
  @Prop({ type: Types.ObjectId, ref: 'PaymentIntent' })
  intentId?: Types.ObjectId;

  @Prop({ type: String, enum: OrderPaymentStatus, default: OrderPaymentStatus.UNPAID })
  status: OrderPaymentStatus;

  @Prop({ type: Date })
  paidAt?: Date;
}
export const OrderPaymentSchema = SchemaFactory.createForClass(OrderPayment);

/** One immutable audit row per state transition. */
@Schema({ _id: false })
export class OrderStatusChange {
  @Prop({ type: String, enum: OrderStatus, required: true }) from: OrderStatus;
  @Prop({ type: String, enum: OrderStatus, required: true }) to: OrderStatus;
  @Prop({ type: Types.ObjectId }) actorId?: Types.ObjectId;
  @Prop({ type: String, enum: [...Object.values(RoleKey), 'customer', 'system'] })
  actorRole?: string;
  @Prop({ type: Types.ObjectId, ref: 'Branch' }) branchId?: Types.ObjectId;
  @Prop({ type: String, trim: true }) reason?: string;
  @Prop({ type: Date, required: true, default: () => new Date() }) at: Date;
}
export const OrderStatusChangeSchema = SchemaFactory.createForClass(OrderStatusChange);

@Schema({ _id: false })
export class OrderCancellation {
  @Prop({ type: String, trim: true, required: true }) reason: string;
  @Prop({ type: Types.ObjectId, ref: 'StaffUser' }) byStaffId?: Types.ObjectId;
  @Prop({ type: Date, default: () => new Date() }) at: Date;
}
export const OrderCancellationSchema = SchemaFactory.createForClass(OrderCancellation);

@Schema({ ...baseSchemaOptions, collection: 'orders' })
export class Order {
  /** Human-friendly, unique reference, e.g. "LNY-24F3K9". */
  @Prop({ required: true, unique: true, uppercase: true, trim: true })
  orderNo: string;

  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true, index: true })
  customerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Branch', required: true, index: true })
  branchId: Types.ObjectId;

  @Prop({ type: String, enum: OrderStatus, default: OrderStatus.CREATED, index: true })
  status: OrderStatus;

  @Prop({ type: OrderFulfillmentSchema, required: true })
  fulfillment: OrderFulfillment;

  @Prop({ type: [OrderItemSchema], required: true, validate: (v: unknown[]) => v.length > 0 })
  items: OrderItem[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Prescription' }], default: [] })
  prescriptionIds: Types.ObjectId[];

  @Prop({ type: Boolean, default: false, index: true })
  requiresRxVerification: boolean;

  @Prop({ type: Date })
  rxVerifiedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'StaffUser' })
  rxVerifiedByStaffId?: Types.ObjectId;

  @Prop({ type: OrderTotalsSchema, required: true })
  totals: OrderTotals;

  @Prop({ type: [String], default: [] })
  promotionCodes: string[];

  @Prop({ type: OrderPaymentSchema, default: () => ({}) })
  payment: OrderPayment;

  @Prop({ type: [OrderStatusChangeSchema], default: [] })
  statusHistory: OrderStatusChange[];

  @Prop({ type: OrderCancellationSchema })
  cancellation?: OrderCancellation;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
// `orderNo` uniqueness is declared inline on the @Prop above.
OrderSchema.index({ customerId: 1, createdAt: -1 });
OrderSchema.index({ branchId: 1, status: 1, createdAt: -1 }); // staff queues
OrderSchema.index({ status: 1, 'payment.status': 1 }); // reconciliation sweeps
OrderSchema.index({ requiresRxVerification: 1, status: 1 }); // pharmacist queue
