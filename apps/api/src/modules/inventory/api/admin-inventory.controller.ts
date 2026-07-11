import {
  Body,
  Controller,
  Get,
  Param,
  Post,
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
  StockMovementQuery,
  StockMovementQuerySchema,
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
