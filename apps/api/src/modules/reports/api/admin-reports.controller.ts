import { Controller, Get, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  ConsumptionExportQuery,
  ConsumptionExportSchema,
  ExpiringExportQuery,
  ExpiringExportSchema,
  ExpiringReportQuery,
  ExpiringReportQuerySchema,
  InventoryValuationExportQuery,
  InventoryValuationExportSchema,
  InventoryValuationQuery,
  InventoryValuationQuerySchema,
  LowStockExportQuery,
  LowStockExportSchema,
  LowStockQuery,
  LowStockQuerySchema,
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

  @Get('low-stock')
  @RequirePermissions('report:read')
  lowStock(
    @CurrentUser() user: AuthPrincipal,
    @Query(new ZodValidationPipe(LowStockQuerySchema)) query: LowStockQuery,
  ) {
    return this.reports.lowStock(user.branchScope, query);
  }

  @Get('expiring')
  @RequirePermissions('report:read')
  expiring(
    @CurrentUser() user: AuthPrincipal,
    @Query(new ZodValidationPipe(ExpiringReportQuerySchema)) query: ExpiringReportQuery,
  ) {
    return this.reports.expiring(user.branchScope, query);
  }

  @Get('low-stock/export')
  @RequirePermissions('report:read')
  async lowStockExport(
    @CurrentUser() user: AuthPrincipal,
    @Query(new ZodValidationPipe(LowStockExportSchema)) query: LowStockExportQuery,
  ): Promise<StreamableFile> {
    const { format, ...rest } = query;
    return this.toFile(await this.reports.exportLowStock(user.branchScope, rest, format));
  }

  @Get('expiring/export')
  @RequirePermissions('report:read')
  async expiringExport(
    @CurrentUser() user: AuthPrincipal,
    @Query(new ZodValidationPipe(ExpiringExportSchema)) query: ExpiringExportQuery,
  ): Promise<StreamableFile> {
    const { format, ...rest } = query;
    return this.toFile(await this.reports.exportExpiring(user.branchScope, rest, format));
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
