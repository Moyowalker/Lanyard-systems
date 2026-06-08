import { Module } from '@nestjs/common';

import { AdminAuditController } from './api/admin-audit.controller';
import { AuditQueryService } from './application/audit-query.service';

/**
 * Read-side of the audit log. The AuditLog model is registered globally
 * (ModelsModule) and written via the global AuditService; this module only
 * exposes the staff-facing viewer endpoint.
 */
@Module({
  controllers: [AdminAuditController],
  providers: [AuditQueryService],
})
export class AuditModule {}
