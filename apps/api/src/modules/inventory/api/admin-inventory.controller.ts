import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AdjustInventoryInput,
  AdjustInventorySchema,
  InventoryExportQuery,
  InventoryExportQuerySchema,
  InventoryExpiringQuery,
  InventoryExpiringQuerySchema,
  ReceiveInventoryInput,
  ReceiveInventorySchema,
  ReceiveInvoiceInput,
  ReceiveInvoiceSchema,
  StockInvoiceQuery,
  StockInvoiceQuerySchema,
  StockMovementQuery,
  StockMovementQuerySchema,
  UpdateInvoiceInput,
  UpdateInvoiceSchema,
  UpdateInvoicePaymentInput,
  UpdateInvoicePaymentSchema,
} from '@lanyard/contracts';

import {
  BranchScoped,
  CurrentUser,
  RequirePermissions,
  RequireRealm,
} from '../../../core/auth/auth.decorators';
import { AuthPrincipal } from '../../../core/auth/principal';
import { BranchScopeGuard, PermissionsGuard, RealmGuard } from '../../../core/auth/authz.guards';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe';
import { InventoryService } from '../application/inventory.service';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/branches/:branchId/inventory')
@UseGuards(RealmGuard, PermissionsGuard, BranchScopeGuard)
@RequireRealm('staff')
@BranchScoped({ from: 'param', key: 'branchId' })
export class AdminInventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @RequirePermissions('inventory:read')
  async list(@Param('branchId') branchId: string) {
    return { data: await this.inventory.listBranchInventory(branchId) };
  }

  @Get('low-stock')
  @RequirePermissions('inventory:read')
  async lowStock(@Param('branchId') branchId: string) {
    return { data: await this.inventory.listLowStock(branchId) };
  }

  @Get('expiring')
  @RequirePermissions('inventory:read')
  async expiring(
    @Param('branchId') branchId: string,
    @Query(new ZodValidationPipe(InventoryExpiringQuerySchema)) query: InventoryExpiringQuery,
  ) {
    return { data: await this.inventory.listExpiring(branchId, query.days) };
  }

  @Get('movements')
  @RequirePermissions('inventory:read')
  async movements(
    @Param('branchId') branchId: string,
    @Query(new ZodValidationPipe(StockMovementQuerySchema)) query: StockMovementQuery,
  ) {
    return this.inventory.listMovements(branchId, query);
  }

  @Get('export')
  @RequirePermissions('inventory:read')
  async export(
    @Param('branchId') branchId: string,
    @Query(new ZodValidationPipe(InventoryExportQuerySchema)) query: InventoryExportQuery,
  ): Promise<StreamableFile> {
    const { buffer, filename, contentType } = await this.inventory.exportBranchInventory(
      branchId,
      query.format,
    );
    return new StreamableFile(buffer, {
      type: contentType,
      disposition: `attachment; filename="${filename}"`,
    });
  }

  /** Receive stock against a supplier invoice (GRN): vendor + invoice no + date + lines. */
  @Post('invoices')
  @RequirePermissions('inventory:receive')
  async receiveInvoice(
    @Param('branchId') branchId: string,
    @CurrentUser() user: AuthPrincipal,
    @Body(new ZodValidationPipe(ReceiveInvoiceSchema)) dto: ReceiveInvoiceInput,
  ) {
    return { data: await this.inventory.receiveInvoice(branchId, user.sub, dto) };
  }

  /** Goods-received history, newest first (optionally filtered by draft/received). */
  @Get('invoices')
  @RequirePermissions('inventory:read')
  async listInvoices(
    @Param('branchId') branchId: string,
    @Query(new ZodValidationPipe(StockInvoiceQuerySchema)) query: StockInvoiceQuery,
  ) {
    return this.inventory.listInvoices(branchId, query);
  }

  /** Update a draft invoice's payload (received invoices are immutable here). */
  @Put('invoices/:id')
  @RequirePermissions('inventory:receive')
  async updateInvoice(
    @Param('branchId') branchId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthPrincipal,
    @Body(new ZodValidationPipe(UpdateInvoiceSchema)) dto: UpdateInvoiceInput,
  ) {
    return { data: await this.inventory.updateInvoice(branchId, user.sub, id, dto) };
  }

  /** Publish a draft invoice: apply stock + price/visibility, mark received. */
  @Post('invoices/:id/publish')
  @RequirePermissions('inventory:receive')
  async publishInvoice(
    @Param('branchId') branchId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return { data: await this.inventory.publishInvoice(branchId, user.sub, id) };
  }

  /** Update an invoice's payment status (paid/unpaid + expected date). */
  @Patch('invoices/:id/payment')
  @RequirePermissions('inventory:receive')
  async updateInvoicePayment(
    @Param('branchId') branchId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthPrincipal,
    @Body(new ZodValidationPipe(UpdateInvoicePaymentSchema)) dto: UpdateInvoicePaymentInput,
  ) {
    return { data: await this.inventory.updateInvoicePayment(branchId, user.sub, id, dto) };
  }

  /** Delete a draft invoice (received invoices cannot be deleted). */
  @Delete('invoices/:id')
  @HttpCode(204)
  @RequirePermissions('inventory:receive')
  async deleteInvoice(
    @Param('branchId') branchId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    await this.inventory.deleteInvoice(branchId, user.sub, id);
  }

  @Post('receive')
  @RequirePermissions('inventory:receive')
  async receive(
    @Param('branchId') branchId: string,
    @CurrentUser() user: AuthPrincipal,
    @Body(new ZodValidationPipe(ReceiveInventorySchema)) dto: ReceiveInventoryInput,
  ) {
    return { data: await this.inventory.receive(branchId, user.sub, dto) };
  }

  @Post('adjust')
  @RequirePermissions('inventory:adjust')
  async adjust(
    @Param('branchId') branchId: string,
    @CurrentUser() user: AuthPrincipal,
    @Body(new ZodValidationPipe(AdjustInventorySchema)) dto: AdjustInventoryInput,
  ) {
    return { data: await this.inventory.adjust(branchId, user.sub, dto) };
  }
}
