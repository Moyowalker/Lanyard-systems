import { z } from 'zod';
import { ActorType } from '../enums';

const auditBranchId = z.string().regex(/^[a-f\d]{24}$/i, 'must be a 24-char ObjectId');

/**
 * Read model for an append-only audit log entry. The audit collection is the
 * compliance/security backbone (PCN, NDPA) — entries are never updated or deleted.
 */
export interface AuditLogDto {
  id: string;
  /** When the action occurred (ISO 8601). */
  at: string;
  actorId?: string;
  actorType: ActorType;
  /** Dotted action key, e.g. "rx.verify", "refund.create", "phi.view". */
  action: string;
  /** Human-readable one-liner, e.g. "Invoice INV-0231 from Emzor — 4 products, 320 units". */
  summary?: string;
  targetType?: string;
  targetId?: string;
  branchId?: string;
  ip?: string;
  userAgent?: string;
  traceId?: string;
  metadata?: Record<string, unknown>;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

/**
 * Query params for the staff audit-log viewer. `action` is a prefix match
 * (e.g. "rx." returns every prescription action). Newest-first.
 */
export const AuditLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  action: z.string().trim().min(1).max(120).optional(),
  actorType: z.nativeEnum(ActorType).optional(),
  targetType: z.string().trim().min(1).max(120).optional(),
  targetId: z.string().trim().min(1).optional(),
  branchId: auditBranchId.optional(),
  /** ISO datetime lower bound (inclusive). */
  from: z.string().optional(),
  /** ISO datetime upper bound (inclusive). */
  to: z.string().optional(),
});
export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;
