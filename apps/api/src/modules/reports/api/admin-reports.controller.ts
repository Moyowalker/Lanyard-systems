import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReportRangeQuery, ReportRangeSchema } from '@lanyard/contracts';

import { CurrentUser, RequirePermissions, RequireRealm } from '../../../core/auth/auth.decorators';
import { PermissionsGuard, RealmGuard } from '../../../core/auth/authz.guards';
import { AuthPrincipal } from '../../../core/auth/principal';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe';
import { ReportsService } from '../application/reports.service';

/** Read-only business insights. Branch-scoped; requires report:read. */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/reports')
@UseGuards(RealmGuard, PermissionsGuard)
@RequireRealm('staff')
export class AdminReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('sales-summary')
  @RequirePermissions('report:read')
  salesSummary(
    @CurrentUser() user: AuthPrincipal,
    @Query(new ZodValidationPipe(ReportRangeSchema)) query: ReportRangeQuery,
  ) {
    return this.reports.salesSummary(user.branchScope, query);
  }
}
