import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ActorType, OutboxStatus } from '@lanyard/contracts';
import { baseSchemaOptions, immutableGuard } from './schema.helpers';

/**
 * Cross-cutting platform collections. In the running app these belong to their
 * owning cores/modules:
 *   - AuditLog       → modules/audit
 *   - OutboxEvent    → core/events
 *   - IdempotencyKey → core/idempotency
 * Co-located here only so the data model is reviewable in one place.
 */

/* ════════════════════════════════════════════════════════════════════════
 * audit_logs — APPEND-ONLY, immutable record of sensitive actions
 * (rx.verify, phi.view, refund.create, role changes, dispensing, …).
 * Compliance + security + dispute backbone. No app-level update/delete.
 * ════════════════════════════════════════════════════════════════════════ */

export type AuditLogDocument = HydratedDocument<AuditLog>;

@Schema({ ...baseSchemaOptions, collection: 'audit_logs' })
export class AuditLog {
  @Prop({ type: Date, required: true, default: () => new Date(), index: true })
  at: Date;

  @Prop({ type: Types.ObjectId, index: true })
  actorId?: Types.ObjectId;

  @Prop({ type: String, enum: ActorType, required: true })
  actorType: ActorType;

  /** Dotted action key, e.g. "rx.verify", "refund.create", "phi.view". */
  @Prop({ required: true, trim: true, index: true })
  action: string;

  @Prop({ type: String, trim: true })
  targetType?: string;

  @Prop({ type: Types.ObjectId })
  targetId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Branch', index: true })
  branchId?: Types.ObjectId;

  @Prop({ type: String })
  ip?: string;

  @Prop({ type: String })
  userAgent?: string;

  /** Correlates this entry to request logs/traces. */
  @Prop({ type: String, index: true })
  traceId?: string;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  /** State snapshots for change-tracking (PHI-minimised). */
  @Prop({ type: Object })
  before?: Record<string, unknown>;

  @Prop({ type: Object })
  after?: Record<string, unknown>;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
AuditLogSchema.index({ at: -1 });
AuditLogSchema.index({ actorId: 1, at: -1 });
AuditLogSchema.index({ targetType: 1, targetId: 1 });
AuditLogSchema.index({ action: 1, at: -1 });
immutableGuard(AuditLogSchema); // append-only

/* ════════════════════════════════════════════════════════════════════════
 * outbox_events — transactional outbox. Domain write + event row commit in
 * one transaction; the worker publishes to queues → no lost domain events.
 * ════════════════════════════════════════════════════════════════════════ */

export type OutboxEventDocument = HydratedDocument<OutboxEvent>;

@Schema({ ...baseSchemaOptions, collection: 'outbox_events' })
export class OutboxEvent {
  @Prop({ required: true, trim: true, index: true })
  type: string; // e.g. "order.paid"

  @Prop({ type: Object, required: true })
  payload: Record<string, unknown>;

  @Prop({ type: String, enum: OutboxStatus, default: OutboxStatus.PENDING, index: true })
  status: OutboxStatus;

  @Prop({ type: Number, default: 0 })
  attempts: number;

  @Prop({ type: String })
  lastError?: string;

  @Prop({ type: Date })
  publishedAt?: Date;
}

export const OutboxEventSchema = SchemaFactory.createForClass(OutboxEvent);
OutboxEventSchema.index({ status: 1, createdAt: 1 }); // publisher polls pending FIFO

/* ════════════════════════════════════════════════════════════════════════
 * idempotency_keys — replay protection for money/stock-mutating requests.
 * Same key returns the stored response instead of re-executing.
 * ════════════════════════════════════════════════════════════════════════ */

export type IdempotencyKeyDocument = HydratedDocument<IdempotencyKey>;

@Schema({ ...baseSchemaOptions, collection: 'idempotency_keys' })
export class IdempotencyKey {
  @Prop({ required: true, unique: true })
  key: string;

  /** Endpoint/operation scope so the same key can't cross operations. */
  @Prop({ required: true, trim: true })
  scope: string;

  /** Hash of the request body — mismatched reuse is rejected (409). */
  @Prop({ required: true })
  requestHash: string;

  @Prop({ type: Object })
  responseSnapshot?: Record<string, unknown>;

  @Prop({ type: Number })
  statusCode?: number;

  /** TTL anchor — keys expire after the retention window. */
  @Prop({ type: Date, required: true, default: () => new Date(Date.now() + 1000 * 60 * 60 * 24) })
  expiresAt: Date;
}

export const IdempotencyKeySchema = SchemaFactory.createForClass(IdempotencyKey);
// `key` uniqueness is declared inline on the @Prop above.
IdempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL cleanup
