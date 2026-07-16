import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { ActorType } from '@lanyard/contracts';

import { AuditLog } from '../../database/platform.schemas';

export interface AuditEntry {
  actorId?: string;
  actorType: ActorType;
  action: string; // e.g. "rx.verify", "order.transition", "phi.view"
  /** Human-readable one-liner shown in the audit viewer, e.g. "Received 24 × Paracetamol". */
  summary?: string;
  targetType?: string;
  targetId?: string;
  branchId?: string;
  traceId?: string;
  metadata?: Record<string, unknown>;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

/**
 * Writes immutable audit entries (append-only collection). Compliance + security
 * backbone for sensitive actions (Rx verification, dispensing, refunds, role/PHI access).
 */
@Injectable()
export class AuditService {
  constructor(@InjectModel(AuditLog.name) private readonly auditModel: Model<AuditLog>) {}

  async record(entry: AuditEntry, session?: ClientSession): Promise<void> {
    const doc = {
      at: new Date(),
      actorId: entry.actorId ? new Types.ObjectId(entry.actorId) : undefined,
      actorType: entry.actorType,
      action: entry.action,
      summary: entry.summary,
      targetType: entry.targetType,
      targetId: entry.targetId ? new Types.ObjectId(entry.targetId) : undefined,
      branchId: entry.branchId ? new Types.ObjectId(entry.branchId) : undefined,
      traceId: entry.traceId,
      metadata: entry.metadata,
      before: entry.before,
      after: entry.after,
    };
    await this.auditModel.create(session ? [doc] : [doc], session ? { session } : undefined);
  }
}
