import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaOptions, SchemaTypeOptions, Schema as MongooseSchema } from 'mongoose';
import { Currency } from '@lanyard/contracts';

/* ──────────────────────────────────────────────────────────────────────────
 * Shared schema options
 * ────────────────────────────────────────────────────────────────────────── */

/** Strip Mongo internals and expose a clean `id` in API responses. */
const idTransform = (_doc: unknown, ret: Record<string, unknown>) => {
  ret.id = ret._id?.toString?.() ?? ret._id;
  delete ret._id;
  return ret;
};

/**
 * Applied to every collection. `timestamps` gives createdAt/updatedAt,
 * `versionKey:false` drops __v, and the toJSON transform normalises output.
 */
export const baseSchemaOptions: SchemaOptions = {
  timestamps: true,
  versionKey: false,
  minimize: false, // keep empty objects (e.g. {} totals) explicit
  toJSON: { virtuals: true, transform: idTransform },
  toObject: { virtuals: true, transform: idTransform },
};

/* ──────────────────────────────────────────────────────────────────────────
 * Reusable validators
 * ────────────────────────────────────────────────────────────────────────── */

/** E.164 phone, e.g. +2348012345678. */
export const E164_REGEX = /^\+[1-9]\d{6,14}$/;

/** Basic email guard (defence-in-depth; real validation happens in DTO zod). */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isNonNegativeInt = (v: number) => Number.isInteger(v) && v >= 0;

/* ──────────────────────────────────────────────────────────────────────────
 * Reusable @Prop option presets
 * ────────────────────────────────────────────────────────────────────────── */

/** Required, non-negative **integer kobo** money amount. */
export const KOBO: SchemaTypeOptions<number> = {
  type: Number,
  required: true,
  default: 0,
  validate: {
    validator: isNonNegativeInt,
    message: 'amount must be a non-negative integer (kobo)',
  },
};

/** Optional non-negative integer kobo amount. */
export const OPTIONAL_KOBO: SchemaTypeOptions<number> = {
  type: Number,
  required: false,
  validate: {
    validator: (v: number | null | undefined) => v == null || isNonNegativeInt(v),
    message: 'amount must be a non-negative integer (kobo)',
  },
};

/** Currency prop, NGN-only at launch. */
export const CURRENCY_PROP: SchemaTypeOptions<string> = {
  type: String,
  enum: Object.values(Currency),
  default: Currency.NGN,
  required: true,
};

/** ObjectId reference prop factory. */
export const refProp = (ref: string, required = true): SchemaTypeOptions<unknown> => ({
  type: MongooseSchema.Types.ObjectId,
  ref,
  required,
  index: true,
});

/* ──────────────────────────────────────────────────────────────────────────
 * Append-only guard — block app-level mutation/deletion of immutable ledgers
 * (audit_logs, stock_movements, payment_txns, outbox is published not edited).
 * ────────────────────────────────────────────────────────────────────────── */

const BLOCKED_OPS = [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'findOneAndReplace',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
] as const;

/**
 * Make a schema append-only at the application layer. Inserts are allowed;
 * any update/delete query throws. (Defence-in-depth; pair with DB-user perms.)
 */
export function immutableGuard<T>(schema: MongooseSchema<T>): MongooseSchema<T> {
  for (const op of BLOCKED_OPS) {
    schema.pre(op as never, function () {
      throw new Error(`This collection is append-only; "${op}" is not permitted.`);
    });
  }
  return schema;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Embedded value objects (sub-schemas)
 * ────────────────────────────────────────────────────────────────────────── */

/** GeoJSON Point: coordinates are [longitude, latitude] (Mongo 2dsphere order). */
@Schema({ _id: false })
export class GeoPoint {
  @Prop({ type: String, enum: ['Point'], default: 'Point', required: true })
  type: 'Point';

  @Prop({ type: [Number], required: true }) // [lng, lat]
  coordinates: [number, number];
}
export const GeoPointSchema = SchemaFactory.createForClass(GeoPoint);

/** Postal/physical address. Used live (customer) and as an immutable snapshot (orders). */
@Schema({ _id: false })
export class Address {
  @Prop({ type: String, trim: true }) label?: string; // "Home", "Work"
  @Prop({ required: true, trim: true }) line1: string;
  @Prop({ type: String, trim: true }) line2?: string;
  @Prop({ required: true, trim: true }) city: string;
  @Prop({ required: true, trim: true }) state: string;
  @Prop({ type: String, default: 'NG', trim: true }) country: string;
  @Prop({ type: String, trim: true }) landmark?: string;
  @Prop({ type: String, match: E164_REGEX }) contactPhone?: string;
  @Prop({ type: GeoPointSchema }) geo?: GeoPoint;
}
export const AddressSchema = SchemaFactory.createForClass(Address);

/** Consent record (NDPA). Versioned so we can prove which policy was accepted. */
@Schema({ _id: false })
export class Consent {
  @Prop({ type: Boolean, default: false }) phiProcessing: boolean;
  @Prop({ type: Boolean, default: false }) marketing: boolean;
  @Prop({ type: String }) version?: string;
  @Prop({ type: Date }) at?: Date;
}
export const ConsentSchema = SchemaFactory.createForClass(Consent);
