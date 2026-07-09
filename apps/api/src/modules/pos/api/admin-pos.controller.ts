import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  PosCreateSaleInput,
  PosCreateSaleSchema,
  PosSalesQuery,
  PosSalesQuerySchema,
} from '@lanyard/contracts';

import {
  BranchScoped,
  CurrentUser,
  RequirePermissions,
  RequireRealm,
} from '../../../core/auth/auth.decorators';
import { BranchScopeGuard, PermissionsGuard, RealmGuard } from '../../../core/auth/authz.guards';
import { AuthPrincipal } from '../../../core/auth/principal';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe';
import { PosService } from '../application/pos.service';

/** Point-of-sale: counter sales rung up by branch staff. */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/pos')
@UseGuards(RealmGuard, PermissionsGuard)
@RequireRealm('staff')
export class AdminPosController {
  constructor(private readonly pos: PosService) {}

  @Post('sales')
  @RequirePermissions('pos:sell')
  @UseGuards(BranchScopeGuard)
  @BranchScoped({ from: 'body', key: 'branchId' })
  createSale(
    @CurrentUser() user: AuthPrincipal,
    @Body(new ZodValidationPipe(PosCreateSaleSchema)) dto: PosCreateSaleInput,
  ) {
    return this.pos.createSale(user, dto);
  }

  /** Today's counter sales (branch-scope enforced in the service; cashiers see their own). */
  @Get('sales')
  @RequirePermissions('pos:sell')
  listSales(
    @CurrentUser() user: AuthPrincipal,
    @Query(new ZodValidationPipe(PosSalesQuerySchema)) query: PosSalesQuery,
  ) {
    return this.pos.listSales(user, query);
  }
}
