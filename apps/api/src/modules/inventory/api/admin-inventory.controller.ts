import {
  BadRequestException,
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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
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

const INVOICE_SCAN_MIME_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};
const MAX_INVOICE_SCAN_BYTES = 10 * 1024 * 1024;

function hasInvoiceScanSignature(mime: string, buffer: Buffer): boolean {
  const signatures: Record<string, number[]> = {
    'application/pdf': [0x25, 0x50, 0x44, 0x46, 0x2d],
    'image/jpeg': [0xff, 0xd8, 0xff],
    'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  };
  const signature = signatures[mime];
  return Boolean(signature?.every((byte, index) => buffer[index] === byte));
}

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
  async list(
    @Param('branchId') branchId: string,
    @Query('q') q?: string,
  ) {
    return { data: await this.inventory.listBranchInventory(branchId, q) };
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

  /** Void a received invoice by recording compensating stock movements. */
  @Post('invoices/:id/void')
  @RequirePermissions('inventory:receive')
  async voidInvoice(
    @Param('branchId') branchId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return { data: await this.inventory.voidInvoice(branchId, user.sub, id) };
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

  /** Upload (or replace) the scanned invoice document — an audit artefact. */
  @Post('invoices/:id/attachment')
  @RequirePermissions('inventory:receive')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_INVOICE_SCAN_BYTES } }))
  async attachInvoiceScan(
    @Param('branchId') branchId: string,
    @Param('id') id: string,
    @CurrentUser() user: AuthPrincipal,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('A file is required');
    const ext = INVOICE_SCAN_MIME_EXT[file.mimetype];
    if (!ext) {
      throw new BadRequestException('Unsupported file type — upload a PDF, JPG, or PNG');
    }
    if (!hasInvoiceScanSignature(file.mimetype, file.buffer)) {
      throw new BadRequestException('File contents do not match the selected file type');
    }
    return {
      data: await this.inventory.attachInvoiceScan(branchId, user.sub, id, {
        buffer: file.buffer,
        mime: file.mimetype,
        ext,
      }),
    };
  }

  /** Short-lived signed URL for the scanned invoice attachment. */
  @Get('invoices/:id/attachment/url')
  @RequirePermissions('inventory:read')
  async invoiceAttachmentUrl(@Param('branchId') branchId: string, @Param('id') id: string) {
    return this.inventory.getInvoiceAttachmentUrl(branchId, id);
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
