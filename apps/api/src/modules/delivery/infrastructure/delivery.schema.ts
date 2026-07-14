import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { DeliveryStatus } from '@lanyard/contracts';
import { baseSchemaOptions, KOBO, Address, AddressSchema } from '../../../database/schema.helpers';

/* ════════════════════════════════════════════════════════════════════════
 * deliveries — fulfillment record for delivery orders. MVP = manual dispatch
 * with status updates (no rider app / live GPS yet). Pickup orders are tracked
 * on the order itself.
 * ════════════════════════════════════════════════════════════════════════ */

export type DeliveryDocument = HydratedDocument<Delivery>;

@Schema({ _id: false })
export class DeliveryTrackingEvent {
  @Prop({ type: String, enum: DeliveryStatus, required: true }) status: DeliveryStatus;
  @Prop({ type: String, trim: true }) note?: string;
  @Prop({ type: Date, required: true, default: () => new Date() }) at: Date;
}
export const DeliveryTrackingEventSchema = SchemaFactory.createForClass(DeliveryTrackingEvent);

@Schema({ _id: false })
export class RiderInfo {
  @Prop({ type: String, trim: true }) name?: string;
  @Prop({ type: String, trim: true }) phone?: string;
  @Prop({ type: String, trim: true }) vehicle?: string;
}
export const RiderInfoSchema = SchemaFactory.createForClass(RiderInfo);

@Schema({ ...baseSchemaOptions, collection: 'deliveries' })
export class Delivery {
  @Prop({ type: Types.ObjectId, ref: 'Order', required: true, unique: true })
  orderId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Branch', required: true, index: true })
  branchId: Types.ObjectId;

  @Prop({ type: String, enum: DeliveryStatus, default: DeliveryStatus.QUEUED, index: true })
  status: DeliveryStatus;

  @Prop({ type: AddressSchema, required: true })
  address: Address;

  /** Customer's delivery instructions, copied from the order at dispatch. */
  @Prop({ type: String, trim: true, maxlength: 500 })
  deliveryNote?: string;

  @Prop({ type: RiderInfoSchema })
  riderInfo?: RiderInfo;

  @Prop({ type: [DeliveryTrackingEventSchema], default: [] })
  trackingEvents: DeliveryTrackingEvent[];

  @Prop(KOBO)
  feeKobo: number;

  @Prop({ type: Date })
  dispatchedAt?: Date;

  @Prop({ type: Date })
  deliveredAt?: Date;
}

export const DeliverySchema = SchemaFactory.createForClass(Delivery);
// `orderId` uniqueness is declared inline on the @Prop above.
DeliverySchema.index({ branchId: 1, status: 1, createdAt: -1 });
