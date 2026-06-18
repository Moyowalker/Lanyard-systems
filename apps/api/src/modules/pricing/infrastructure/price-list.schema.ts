import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  baseSchemaOptions,
  KOBO,
  OPTIONAL_KOBO,
  CURRENCY_PROP,
} from '../../../database/schema.helpers';
import { Currency } from '@lanyard/contracts';

/* ════════════════════════════════════════════════════════════════════════
 * price_lists — PER-BRANCH price & availability for a global product.
 * One row per (branchId, productId). Pricing differs by location.
 * ════════════════════════════════════════════════════════════════════════ */

export type PriceListDocument = HydratedDocument<PriceList>;

@Schema({ ...baseSchemaOptions, collection: 'price_lists' })
export class PriceList {
  @Prop({ type: Types.ObjectId, ref: 'Branch', required: true, index: true })
  branchId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', required: true, index: true })
  productId: Types.ObjectId;

  @Prop(KOBO)
  priceKobo: number;

  /** What the branch paid for the drug — used for margin & valuation reporting. */
  @Prop(OPTIONAL_KOBO)
  costKobo?: number;

  /** Optional "was" price for showing discounts. */
  @Prop(OPTIONAL_KOBO)
  compareAtKobo?: number;

  @Prop(CURRENCY_PROP)
  currency: Currency;

  /** Branch-level toggle independent of stock (e.g. delisted at this branch). */
  @Prop({ type: Boolean, default: true, index: true })
  isAvailable: boolean;

  @Prop({ type: Date })
  effectiveFrom?: Date;

  @Prop({ type: Date })
  effectiveTo?: Date;
}

export const PriceListSchema = SchemaFactory.createForClass(PriceList);
PriceListSchema.index({ branchId: 1, productId: 1 }, { unique: true });
PriceListSchema.index({ branchId: 1, isAvailable: 1 });
