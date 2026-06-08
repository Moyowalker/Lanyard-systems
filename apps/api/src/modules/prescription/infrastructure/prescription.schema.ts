import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { AvScanStatus, RxStatus, VerificationDecision } from '@lanyard/contracts';
import { baseSchemaOptions } from '../../../database/schema.helpers';

/* ════════════════════════════════════════════════════════════════════════
 * prescriptions — PHI. Images live in the ENCRYPTED OBJECT STORE; this doc
 * only holds object keys + workflow state. Access to files is via short-lived
 * signed URLs and is AUDITED (phi.view). A pharmacist verification is a
 * regulatory hard-stop before any POM item can be fulfilled.
 * ════════════════════════════════════════════════════════════════════════ */

export type PrescriptionDocument = HydratedDocument<Prescription>;

@Schema({ _id: true })
export class RxFile {
  /** Object-store key — NOT a public URL. */
  @Prop({ required: true })
  objectKey: string;

  @Prop({ required: true })
  mime: string;

  @Prop({ type: Number, min: 0, required: true })
  sizeBytes: number;

  @Prop({ type: String, enum: AvScanStatus, default: AvScanStatus.PENDING })
  avScan: AvScanStatus;

  @Prop({ type: Date, default: () => new Date() })
  uploadedAt: Date;
}
export const RxFileSchema = SchemaFactory.createForClass(RxFile);

@Schema({ _id: false })
export class RxPrescriber {
  @Prop({ type: String, trim: true }) name?: string;
  @Prop({ type: String, trim: true }) regNo?: string;
  @Prop({ type: String, trim: true }) hospital?: string;
}
export const RxPrescriberSchema = SchemaFactory.createForClass(RxPrescriber);

@Schema({ _id: false })
export class RxRequestedItem {
  @Prop({ type: Types.ObjectId, ref: 'Product' }) productId?: Types.ObjectId;
  @Prop({ type: String, trim: true }) freeText?: string; // when not matched to catalog
  @Prop({ type: Number, min: 0 }) quantity?: number;
  @Prop({ type: String, trim: true }) directions?: string;
}
export const RxRequestedItemSchema = SchemaFactory.createForClass(RxRequestedItem);

@Schema({ _id: false })
export class RxVerification {
  @Prop({ type: Types.ObjectId, ref: 'StaffUser', required: true })
  pharmacistStaffId: Types.ObjectId;

  /** Snapshotted at verification time for the audit trail. */
  @Prop({ required: true })
  pcnLicenseNo: string;

  @Prop({ type: String, enum: VerificationDecision, required: true })
  decision: VerificationDecision;

  @Prop({ type: String, trim: true })
  note?: string;

  @Prop({ type: Date, required: true, default: () => new Date() })
  at: Date;
}
export const RxVerificationSchema = SchemaFactory.createForClass(RxVerification);

@Schema({ ...baseSchemaOptions, collection: 'prescriptions' })
export class Prescription {
  @Prop({ type: Types.ObjectId, ref: 'Customer', required: true, index: true })
  customerId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Branch', required: true, index: true })
  branchId: Types.ObjectId;

  @Prop({ type: [RxFileSchema], default: [] })
  files: RxFile[];

  @Prop({ type: String, enum: RxStatus, default: RxStatus.PENDING, index: true })
  status: RxStatus;

  @Prop({ type: RxPrescriberSchema })
  prescriber?: RxPrescriber;

  @Prop({ type: [RxRequestedItemSchema], default: [] })
  items: RxRequestedItem[];

  @Prop({ type: RxVerificationSchema })
  verification?: RxVerification;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Order' }], default: [] })
  linkedOrderIds: Types.ObjectId[];

  /** Rx validity window — an expired prescription cannot be used. */
  @Prop({ type: Date })
  expiresAt?: Date;
}

export const PrescriptionSchema = SchemaFactory.createForClass(Prescription);
PrescriptionSchema.index({ customerId: 1, createdAt: -1 });
PrescriptionSchema.index({ branchId: 1, status: 1 });
PrescriptionSchema.index({ status: 1, createdAt: 1 }); // pharmacist work queue (FIFO)
