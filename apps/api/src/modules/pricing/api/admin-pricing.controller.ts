import { Body, Controller, Get, HttpCode, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UpsertPriceInput, UpsertPriceSchema } from '@lanyard/contracts';

import { BranchScoped, RequirePermissions, RequireRealm } from '../../../core/auth/auth.decorators';
import { BranchScopeGuard, PermissionsGuard, RealmGuard } from '../../../core/auth/authz.guards';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe';
import { PricingService } from '../application/pricing.service';

/**
 * Per-branch pricing. BRANCH-SCOPED: a branch manager may only manage prices for a
 * branch in their scope (staff with ALL scope bypass). The guard reads :branchId
 * from the path.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/branches/:branchId/prices')
@UseGuards(RealmGuard, PermissionsGuard, BranchScopeGuard)
@RequireRealm('staff')
@BranchScoped({ from: 'param', key: 'branchId' })
export class AdminPricingController {
  constructor(private readonly pricing: PricingService) {}

  @Get()
  @RequirePermissions('pricing:read')
  async list(@Param('branchId') branchId: string) {
    return { data: await this.pricing.getBranchPrices(branchId) };
  }

  @Put()
  @HttpCode(200)
  @RequirePermissions('pricing:write')
  async upsert(
    @Param('branchId') branchId: string,
    @Body(new ZodValidationPipe(UpsertPriceSchema)) dto: UpsertPriceInput,
  ) {
    await this.pricing.upsertPrice(branchId, dto);
    return { ok: true };
  }
}
