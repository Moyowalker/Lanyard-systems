import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { BranchScoped, RequirePermissions, RequireRealm } from '../../../core/auth/auth.decorators';
import { BranchScopeGuard, PermissionsGuard, RealmGuard } from '../../../core/auth/authz.guards';
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
}