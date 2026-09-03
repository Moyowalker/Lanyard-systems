import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  HeldSaleInput,
  HeldSaleInputSchema,
  PosCreateSaleInput,
  PosCreateSaleSchema,
  PosReturnInput,
  PosReturnSchema,
  PosSalesQuery,
  PosSalesQuerySchema,
  ProductListQuery,
  ProductListQuerySchema,
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

  @Get('held-sales')
  @RequirePermissions('pos:sell')
  listHeldSales(@CurrentUser() user: AuthPrincipal, @Query('branchId') branchId: string) {
    return this.pos.listHeldSales(user, branchId);
  }

  @Post('held-sales')
  @RequirePermissions('pos:sell')
  @UseGuards(BranchScopeGuard)
  @BranchScoped({ from: 'body', key: 'branchId' })
  holdSale(
    @CurrentUser() user: AuthPrincipal,
    @Body(new ZodValidationPipe(HeldSaleInputSchema)) dto: HeldSaleInput,
  ) {
    return this.pos.holdSale(user, dto);
  }

  @Delete('held-sales/:id')
  @HttpCode(204)
  @RequirePermissions('pos:sell')
  async deleteHeldSale(@CurrentUser() user: AuthPrincipal, @Param('id') id: string): Promise<void> {
    await this.pos.deleteHeldSale(user, id);
  }

  /** Return part or all of a completed counter sale (branch scope checked in service). */
  @Post('sales/:orderId/return')
  @RequirePermissions('pos:refund')
  returnSale(
    @CurrentUser() user: AuthPrincipal,
    @Param('orderId') orderId: string,
    @Body(new ZodValidationPipe(PosReturnSchema)) dto: PosReturnInput,
  ) {
    return this.pos.returnSale(user, orderId, dto);
  }

  /** Till product lookup — includes storefront-hidden products (scope checked in service). */
  @Get('products')
  @RequirePermissions('pos:sell')
  listProducts(
    @CurrentUser() user: AuthPrincipal,
    @Query(new ZodValidationPipe(ProductListQuerySchema)) query: ProductListQuery,
  ) {
    return this.pos.listProducts(user, query);
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
