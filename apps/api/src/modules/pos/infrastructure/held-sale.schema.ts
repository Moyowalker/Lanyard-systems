import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

import { baseSchemaOptions } from '../../../database/schema.helpers';

export type HeldSaleDocument = HydratedDocument<HeldSale>;

@Schema({ ...baseSchemaOptions, collection: 'held_sales' })
export class HeldSale {
  @Prop({ type: Types.ObjectId, ref: 'Branch', required: true, index: true })
  branchId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'StaffUser', required: true, index: true })
  cashierStaffId: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true, maxlength: 160 })
  label: string;

  @Prop({ type: [{ productId: { type: Types.ObjectId, required: true }, name: String, quantity: Number }], default: [] })
  lines: Array<{ productId: Types.ObjectId; name: string; quantity: number }>;

  @Prop({ type: String, trim: true }) customerPhone?: string;
  @Prop({ type: String, trim: true }) customerFirst?: string;
  @Prop({ type: String, trim: true }) customerLast?: string;
  @Prop({ type: String, trim: true, maxlength: 500 }) rxNote?: string;
  @Prop({ type: String, enum: ['percent', 'fixed'], required: true }) discountType: 'percent' | 'fixed';
  @Prop({ type: String, trim: true }) discountValue: string;
}

export const HeldSaleSchema = SchemaFactory.createForClass(HeldSale);
HeldSaleSchema.index({ branchId: 1, cashierStaffId: 1, createdAt: -1 });