import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  Currency,
  PaymentChannel,
  PaymentIntentStatus,
  PaymentProvider,
  PaymentTxnType,
  RefundStatus,
} from '@lanyard/contracts';
import {
  baseSchemaOptions,
  KOBO,
  CURRENCY_PROP,
  immutableGuard,
} from '../../../database/schema.helpers';

/* ════════════════════════════════════════════════════════════════════════
 * payment_intents — one per payment attempt against a provider (Paystack at
 * MVP). Idempotency-keyed. The intent tracks *our* attempt; truth about money
 * comes from verified webhooks recorded as payment_txns.
 * ════════════════════════════════════════════════════════════════════════ */

export type PaymentIntentDocument = HydratedDocument<PaymentIntent>;

@Schema({ ...baseSchemaOptions, collection: 'payment_intents' })
export class PaymentIntent {
  @Prop({ type: Types.ObjectId, ref: 'Order', required: true, index: true })
  orderId: Types.ObjectId;

  @Prop({ type: String, enum: PaymentProvider, required: true, default: PaymentProvider.PAYSTACK })
  provider: PaymentProvider;

  /** Provider-side reference (e.g. Paystack reference). */
  @Prop({ type: String, index: true })
  providerRef?: string;

  /** Our unique reference sent to the provider. */
  @Prop({ required: true, unique: true })
  ourRef: string;

  @Prop(KOBO)
  amountKobo: number;

  @Prop(CURRENCY_PROP)
  currency: Currency;

  @Prop({
    type: String,
    enum: PaymentIntentStatus,
    default: PaymentIntentStatus.CREATED,
    index: true,
  })
  status: PaymentIntentStatus;

  /** Replay-safe creation: same key returns the same intent, never double-charges. */
  @Prop({ required: true, index: true })
  idempotencyKey: string;

  @Prop({ type: String })
  redirectUrl?: string;

  /** Last provider event id applied — guards against duplicate webhook processing. */
  @Prop({ type: String })
  lastWebhookEventId?: string;
}

export const PaymentIntentSchema = SchemaFactory.createForClass(PaymentIntent);
// `ourRef` uniqueness and `orderId` index are declared inline on their @Prop above.
PaymentIntentSchema.index({ provider: 1, providerRef: 1 });
PaymentIntentSchema.index({ status: 1, createdAt: 1 }); // reconciliation of stuck intents

/* ════════════════════════════════════════════════════════════════════════
 * payment_txns — APPEND-ONLY record of verified provider events (charges &
 * refunds). Deduped by providerEventId (idempotent webhooks).
 * ════════════════════════════════════════════════════════════════════════ */

export type PaymentTransactionDocument = HydratedDocument<PaymentTransaction>;

@Schema({ ...baseSchemaOptions, collection: 'payment_txns' })
export class PaymentTransaction {
  @Prop({ type: Types.ObjectId, ref: 'PaymentIntent', required: true, index: true })
  intentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Order', required: true, index: true })
  orderId: Types.ObjectId;

  @Prop({ type: String, enum: PaymentProvider, required: true })
  provider: PaymentProvider;

  /** Provider's unique event id — the dedupe key for webhooks. */
  @Prop({ required: true, unique: true })
  providerEventId: string;

  @Prop({ type: String, enum: PaymentTxnType, required: true })
  type: PaymentTxnType;

  @Prop({ required: true })
  status: string; // provider-reported terminal status (e.g. "success")

  @Prop(KOBO)
  amountKobo: number;

  @Prop(CURRENCY_PROP)
  currency: Currency;

  @Prop({ type: String, enum: PaymentChannel })
  channel?: PaymentChannel;

  /** Raw verified payload for dispute/audit. Not serialised to clients. */
  @Prop({ type: Object, select: false })
  rawProviderPayload?: Record<string, unknown>;
}

export const PaymentTransactionSchema = SchemaFactory.createForClass(PaymentTransaction);
// `providerEventId` uniqueness and `orderId` index are declared inline on their @Prop above.
immutableGuard(PaymentTransactionSchema); // append-only ledger

/* ════════════════════════════════════════════════════════════════════════
 * refunds — staff-initiated, permissioned (refund:create) and audited.
 * ════════════════════════════════════════════════════════════════════════ */

export type RefundDocument = HydratedDocument<Refund>;

@Schema({ ...baseSchemaOptions, collection: 'refunds' })
export class Refund {
  @Prop({ type: Types.ObjectId, ref: 'Order', required: true, index: true })
  orderId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'PaymentIntent', required: true })
  intentId: Types.ObjectId;

  @Prop(KOBO)
  amountKobo: number;

  @Prop(CURRENCY_PROP)
  currency: Currency;

  @Prop({ required: true, trim: true })
  reason: string;

  @Prop({ type: String, enum: RefundStatus, default: RefundStatus.REQUESTED, index: true })
  status: RefundStatus;

  @Prop({ type: Types.ObjectId, ref: 'StaffUser', required: true })
  requestedByStaffId: Types.ObjectId;

  @Prop({ type: String })
  providerRefundRef?: string;
}

export const RefundSchema = SchemaFactory.createForClass(Refund);
// `orderId` index is declared inline on the @Prop above.
RefundSchema.index({ status: 1, createdAt: 1 });
