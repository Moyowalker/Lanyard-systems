import { Body, Controller, Get, HttpCode, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ActorType, UpsertPriceInput, UpsertPriceSchema } from '@lanyard/contracts';

import { BranchScoped, CurrentUser, RequirePermissions, RequireRealm } from '../../../core/auth/auth.decorators';
import { BranchScopeGuard, PermissionsGuard, RealmGuard } from '../../../core/auth/authz.guards';
import { AuthPrincipal } from '../../../core/auth/principal';
import { AuditService } from '../../../core/platform/audit.service';
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
  constructor(
    private readonly pricing: PricingService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('pricing:read')
  async list(@Param('branchId') branchId: string) {
    return { data: await this.pricing.getBranchPrices(branchId) };
  }

  @Put()
  @HttpCode(200)
  @RequirePermissions('pricing:write')
  async upsert(
    @CurrentUser() user: AuthPrincipal,
    @Param('branchId') branchId: string,
    @Body(new ZodValidationPipe(UpsertPriceSchema)) dto: UpsertPriceInput,
  ) {
    const change = await this.pricing.upsertPrice(branchId, dto);
    await this.audit.record({
      actorId: user.sub,
      actorType: ActorType.STAFF,
      action: 'pricing.update',
      summary: `${change.before ? 'Updated' : 'Set'} price for product ${dto.productId}`,
      targetType: 'price_list',
      targetId: dto.productId,
      branchId,
      metadata: { productId: dto.productId, branchId },
      before: change.before ? { ...change.before } : undefined,
      after: { ...change.after },
    });
    return { ok: true };
  }
}
