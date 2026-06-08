import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BranchStatus } from '@lanyard/contracts';
import {
  baseSchemaOptions,
  GeoPoint,
  GeoPointSchema,
  KOBO,
  E164_REGEX,
  EMAIL_REGEX,
} from '../../../database/schema.helpers';

/* ════════════════════════════════════════════════════════════════════════
 * branches — physical pharmacy locations. The primary scoping dimension.
 * A branch cannot be ACTIVE without an in-date superintendent pharmacist
 * (enforced in BranchService, surfaced via license fields below).
 * ════════════════════════════════════════════════════════════════════════ */

export type BranchDocument = HydratedDocument<Branch>;

@Schema({ _id: false })
export class BranchAddress {
  @Prop({ required: true, trim: true }) line1: string;
  @Prop({ type: String, trim: true }) line2?: string;
  @Prop({ required: true, trim: true }) city: string;
  @Prop({ required: true, trim: true }) state: string;
  @Prop({ type: String, default: 'NG', trim: true }) country: string;
  @Prop({ type: GeoPointSchema, required: true }) geo: GeoPoint; // [lng, lat]
}
export const BranchAddressSchema = SchemaFactory.createForClass(BranchAddress);

@Schema({ _id: false })
export class OperatingHours {
  @Prop({ type: Number, min: 0, max: 6, required: true }) day: number; // 0=Sun
  @Prop({ required: true }) open: string; // "08:00"
  @Prop({ required: true }) close: string; // "21:00"
  @Prop({ type: Boolean, default: false }) closed?: boolean;
}
export const OperatingHoursSchema = SchemaFactory.createForClass(OperatingHours);

@Schema({ _id: false })
export class DeliveryZone {
  @Prop({ required: true, trim: true }) name: string;
  @Prop({ type: Number, min: 0 }) radiusKm?: number;
  @Prop({ type: [[Number]] }) polygon?: number[][]; // optional GeoJSON-style ring
  @Prop(KOBO) feeKobo: number;
  @Prop({ type: Number, min: 0 }) etaMins?: number;
}
export const DeliveryZoneSchema = SchemaFactory.createForClass(DeliveryZone);

@Schema({ _id: false })
export class BranchLicense {
  @Prop({ required: true, trim: true }) pcnPremisesNo: string;
  @Prop({ type: Types.ObjectId, ref: 'StaffUser', required: true })
  superintendentStaffId: Types.ObjectId;
}
export const BranchLicenseSchema = SchemaFactory.createForClass(BranchLicense);

@Schema({ _id: false })
export class BranchContact {
  @Prop({ type: String, match: E164_REGEX }) phone?: string;
  @Prop({ type: String, lowercase: true, match: EMAIL_REGEX }) email?: string;
}
export const BranchContactSchema = SchemaFactory.createForClass(BranchContact);

@Schema({ _id: false })
export class BranchFulfillment {
  @Prop({ type: Boolean, default: true }) pickup: boolean;
  @Prop({ type: Boolean, default: false }) delivery: boolean;
  @Prop({ type: [DeliveryZoneSchema], default: [] }) deliveryZones: DeliveryZone[];
}
export const BranchFulfillmentSchema = SchemaFactory.createForClass(BranchFulfillment);

@Schema({ ...baseSchemaOptions, collection: 'branches' })
export class Branch {
  @Prop({ required: true, unique: true, uppercase: true, trim: true })
  code: string; // e.g. "LAG-IKEJA-01"

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, enum: BranchStatus, default: BranchStatus.INACTIVE, index: true })
  status: BranchStatus;

  @Prop({ type: BranchAddressSchema, required: true })
  address: BranchAddress;

  @Prop({ type: BranchContactSchema, default: () => ({}) })
  contact: BranchContact;

  @Prop({ type: BranchLicenseSchema, required: true })
  license: BranchLicense;

  @Prop({ type: [OperatingHoursSchema], default: [] })
  hours: OperatingHours[];

  @Prop({ type: BranchFulfillmentSchema, default: () => ({}) })
  fulfillment: BranchFulfillment;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const BranchSchema = SchemaFactory.createForClass(Branch);
// `code` uniqueness and `status` index are declared inline on their @Prop above.
BranchSchema.index({ 'address.geo': '2dsphere' }); // nearest-branch locator
