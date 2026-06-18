import { Controller, Get, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  ConsumptionExportQuery,
  ConsumptionExportSchema,
  InventoryValuationExportQuery,
  InventoryValuationExportSchema,
  InventoryValuationQuery,
  InventoryValuationQuerySchema,
  ReportRangeQuery,
  ReportRangeSchema,
  SalesExportQuery,
  SalesExportSchema,
} from '@lanyard/contracts';

import { CurrentUser, RequirePermissions, RequireRealm } from '../../../core/auth/auth.decorators';
import { PermissionsGuard, RealmGuard } from '../../../core/auth/authz.guards';
import { AuthPrincipal } from '../../../core/auth/principal';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe';
import { SpreadsheetFile } from '../../../core/export/spreadsheet';
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

  @Get('inventory-valuation')
  @RequirePermissions('report:read')
  inventoryValuation(
    @CurrentUser() user: AuthPrincipal,
    @Query(new ZodValidationPipe(InventoryValuationQuerySchema)) query: InventoryValuationQuery,
  ) {
    return this.reports.inventoryValuation(user.branchScope, query);
  }

  @Get('consumption')
  @RequirePermissions('report:read')
  consumption(
    @CurrentUser() user: AuthPrincipal,
    @Query(new ZodValidationPipe(ReportRangeSchema)) query: ReportRangeQuery,
  ) {
    return this.reports.consumption(user.branchScope, query);
  }

  @Get('sales-summary/export')
  @RequirePermissions('report:read')
  async salesExport(
    @CurrentUser() user: AuthPrincipal,
    @Query(new ZodValidationPipe(SalesExportSchema)) query: SalesExportQuery,
  ): Promise<StreamableFile> {
    const { format, ...range } = query;
    return this.toFile(await this.reports.exportSalesSummary(user.branchScope, range, format));
  }

  @Get('inventory-valuation/export')
  @RequirePermissions('report:read')
  async inventoryValuationExport(
    @CurrentUser() user: AuthPrincipal,
    @Query(new ZodValidationPipe(InventoryValuationExportSchema))
    query: InventoryValuationExportQuery,
  ): Promise<StreamableFile> {
    const { format, ...rest } = query;
    return this.toFile(await this.reports.exportInventoryValuation(user.branchScope, rest, format));
  }

  @Get('consumption/export')
  @RequirePermissions('report:read')
  async consumptionExport(
    @CurrentUser() user: AuthPrincipal,
    @Query(new ZodValidationPipe(ConsumptionExportSchema)) query: ConsumptionExportQuery,
  ): Promise<StreamableFile> {
    const { format, ...range } = query;
    return this.toFile(await this.reports.exportConsumption(user.branchScope, range, format));
  }

  private toFile(file: SpreadsheetFile): StreamableFile {
    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: `attachment; filename="${file.filename}"`,
    });
  }
}
