import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

import { baseSchemaOptions, E164_REGEX, EMAIL_REGEX } from '../../../database/schema.helpers';

/* ════════════════════════════════════════════════════════════════════════
 * vendors — suppliers a branch receives stock from. Org-level registry;
 * stock invoices reference a vendor by id and snapshot its name.
 * ════════════════════════════════════════════════════════════════════════ */

export type VendorDocument = HydratedDocument<Vendor>;

@Schema({ ...baseSchemaOptions, collection: 'vendors' })
export class Vendor {
  @Prop({ required: true, trim: true, maxlength: 160, unique: true })
  name: string;

  @Prop({ type: String, trim: true, maxlength: 160 })
  contactName?: string;

  @Prop({ type: String, trim: true, match: E164_REGEX })
  phone?: string;

  @Prop({ type: String, trim: true, match: EMAIL_REGEX, maxlength: 200 })
  email?: string;

  @Prop({ type: String, trim: true, maxlength: 300 })
  address?: string;

  @Prop({ type: String, trim: true, maxlength: 500 })
  note?: string;

  @Prop({ type: Boolean, default: true, index: true })
  isActive: boolean;

  /** Soft-delete marker (mirrors the branch registry pattern). */
  @Prop({ type: Date })
  deletedAt?: Date;
}

export const VendorSchema = SchemaFactory.createForClass(Vendor);
