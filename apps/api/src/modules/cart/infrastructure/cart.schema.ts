import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { baseSchemaOptions } from '../../../database/schema.helpers';

/* ════════════════════════════════════════════════════════════════════════
 * carts — branch-scoped working basket. Either customer-owned or anonymous
 * (anonId). TTL clears abandoned carts. Prices are NOT trusted from here —
 * checkout recomputes from price_lists.
 * ════════════════════════════════════════════════════════════════════════ */

export type CartDocument = HydratedDocument<Cart>;

@Schema({ _id: false })
export class CartItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId: Types.ObjectId;

  @Prop({ type: Number, required: true, min: 1 })
  quantity: number;

  /** Snapshot of the catalog flag at add-time; re-validated at checkout. */
  @Prop({ type: Boolean, default: false })
  requiresPrescription: boolean;
}
export const CartItemSchema = SchemaFactory.createForClass(CartItem);

@Schema({ ...baseSchemaOptions, collection: 'carts' })
export class Cart {
  @Prop({ type: Types.ObjectId, ref: 'Customer', index: true })
  customerId?: Types.ObjectId;

  /** Anonymous cart key for guests (cookie-backed) before login. */
  @Prop({ type: String, index: true })
  anonId?: string;

  /** Set when the first item is added; an empty cart has no branch yet. */
  @Prop({ type: Types.ObjectId, ref: 'Branch', index: true })
  branchId?: Types.ObjectId;

  @Prop({ type: [CartItemSchema], default: [] })
  items: CartItem[];

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Prescription' }], default: [] })
  prescriptionIds: Types.ObjectId[];

  /** TTL anchor for abandoned-cart cleanup. */
  @Prop({
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
  })
  expiresAt: Date;
}

export const CartSchema = SchemaFactory.createForClass(Cart);
// `customerId` and `anonId` indexes are declared inline on their @Prop above.
CartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL cleanup
