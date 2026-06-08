import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ALL_BRANCHES, AuditLogDto, AuditLogQuery, Paginated } from '@lanyard/contracts';

import { AuditLog, AuditLogDocument } from '../../../database/platform.schemas';
import { cursorFilterDesc, paginate } from '../../../core/pagination/cursor';

/** Escape user input before embedding in a RegExp (prevents regex injection). */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Read-side of the append-only audit log. Branch-scoped, newest-first, filterable.
 * Writes happen via {@link AuditService}; this service never mutates the collection.
 */
@Injectable()
export class AuditQueryService {
  constructor(@InjectModel(AuditLog.name) private readonly model: Model<AuditLog>) {}

  async list(query: AuditLogQuery, branchScope: string[]): Promise<Paginated<AuditLogDto>> {
    const filter: Record<string, unknown> = { ...cursorFilterDesc(query.cursor) };

    // Branch scope: ALL-scope staff see everything (incl. platform-level entries
    // with no branchId); branch-scoped staff see only their branches.
    if (!branchScope.includes(ALL_BRANCHES)) {
      filter.branchId = { $in: branchScope.map((id) => new Types.ObjectId(id)) };
    }

    if (query.action) {
      filter.action = { $regex: `^${escapeRegex(query.action)}`, $options: 'i' };
    }
    if (query.actorType) filter.actorType = query.actorType;
    if (query.targetType) filter.targetType = query.targetType;
    if (query.targetId && Types.ObjectId.isValid(query.targetId)) {
      filter.targetId = new Types.ObjectId(query.targetId);
    }

    const at: Record<string, Date> = {};
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && !Number.isNaN(from.getTime())) at.$gte = from;
    if (to && !Number.isNaN(to.getTime())) at.$lte = to;
    if (Object.keys(at).length > 0) filter.at = at;

    const rows = await this.model
      .find(filter)
      .sort({ _id: -1 })
      .limit(query.limit + 1)
      .exec();

    return paginate(
      rows.map((r) => this.toDto(r)),
      query.limit,
    );
  }

  private toDto(d: AuditLogDocument): AuditLogDto {
    return {
      id: (d._id as Types.ObjectId).toString(),
      at: d.at.toISOString(),
      actorId: d.actorId?.toString(),
      actorType: d.actorType,
      action: d.action,
      targetType: d.targetType,
      targetId: d.targetId?.toString(),
      branchId: d.branchId?.toString(),
      ip: d.ip,
      userAgent: d.userAgent,
      traceId: d.traceId,
      metadata: d.metadata,
      before: d.before,
      after: d.after,
    };
  }
}
