import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AdjustInventoryInput,
  AdjustInventorySchema,
  ReceiveInventoryInput,
  ReceiveInventorySchema,
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