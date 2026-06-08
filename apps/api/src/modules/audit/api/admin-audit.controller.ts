import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditLogQuery, AuditLogQuerySchema } from '@lanyard/contracts';

import { CurrentUser, RequirePermissions, RequireRealm } from '../../../core/auth/auth.decorators';
import { PermissionsGuard, RealmGuard } from '../../../core/auth/authz.guards';
import { AuthPrincipal } from '../../../core/auth/principal';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe';
import { AuditQueryService } from '../application/audit-query.service';

/** Staff audit-log viewer — branch-scoped, newest-first, gated by `audit:read`. */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/audit')
@UseGuards(RealmGuard, PermissionsGuard)
@RequireRealm('staff')
export class AdminAuditController {
  constructor(private readonly audit: AuditQueryService) {}

  @Get()
  @RequirePermissions('audit:read')
  list(
    @CurrentUser() user: AuthPrincipal,
    @Query(new ZodValidationPipe(AuditLogQuerySchema)) query: AuditLogQuery,
  ) {
    return this.audit.list(query, user.branchScope);
  }
}
