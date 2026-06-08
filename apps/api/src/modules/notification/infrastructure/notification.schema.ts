import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { NotificationChannel, NotificationStatus, PrincipalType } from '@lanyard/contracts';
import { baseSchemaOptions } from '../../../database/schema.helpers';

/* ════════════════════════════════════════════════════════════════════════
 * notifications — log of every message sent (SMS/email at MVP; whatsapp/push
 * later). Event-driven: produced from domain events, delivered via the worker.
 * Every send is logged for audit and delivery troubleshooting.
 * ════════════════════════════════════════════════════════════════════════ */

export type NotificationDocument = HydratedDocument<Notification>;

@Schema({ ...baseSchemaOptions, collection: 'notifications' })
export class Notification {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  recipientId: Types.ObjectId;

  @Prop({ type: String, enum: PrincipalType, required: true })
  recipientType: PrincipalType;

  @Prop({ type: String, enum: NotificationChannel, required: true })
  channel: NotificationChannel;

  /** Template id, e.g. "order.paid", "rx.verified", "otp.login". */
  @Prop({ required: true, trim: true })
  template: string;

  /** Render variables. Avoid storing PHI here; reference by id where possible. */
  @Prop({ type: Object, default: {} })
  payload: Record<string, unknown>;

  @Prop({ type: String, enum: NotificationStatus, default: NotificationStatus.QUEUED, index: true })
  status: NotificationStatus;

  @Prop({ type: String })
  providerRef?: string;

  @Prop({ type: String })
  error?: string;

  @Prop({ type: Number, default: 0 })
  attempts: number;

  @Prop({ type: Date })
  sentAt?: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
NotificationSchema.index({ recipientId: 1, createdAt: -1 });
NotificationSchema.index({ status: 1, createdAt: 1 }); // retry sweeps
