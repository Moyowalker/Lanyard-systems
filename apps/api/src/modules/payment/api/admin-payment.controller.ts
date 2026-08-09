import { Body, Controller, ForbiddenException, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ErrorCode, RefundInput, RefundSchema } from '@lanyard/contracts';

import { CurrentUser, RequirePermissions, RequireRealm } from '../../../core/auth/auth.decorators';
import { PermissionsGuard, RealmGuard } from '../../../core/auth/authz.guards';
import { AuthPrincipal } from '../../../core/auth/principal';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe';
import { PaymentService } from '../application/payment.service';
import { RefundService } from '../application/refund.service';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('admin/payments')
@UseGuards(RealmGuard, PermissionsGuard)
@RequireRealm('staff')
export class AdminPaymentController {
  constructor(
    private readonly payments: PaymentService,
    private readonly refunds: RefundService,
  ) {}

  /** Manually trigger reconciliation of pending intents (also runnable as a scheduled job). */
  @Post('reconcile')
  @RequirePermissions('order:read')
  reconcile(@CurrentUser() user: AuthPrincipal) {
    if (!user.branchScope.includes('ALL')) {
      throw new ForbiddenException({
        code: ErrorCode.BRANCH_SCOPE_VIOLATION,
        message: 'All-branch scope is required to reconcile payments',
      });
    }
    return this.payments.reconcile();
  }

  /** Refund a paid order (releases stock + moves order to REFUNDED). */
  @Post('refund')
  @RequirePermissions('refund:create')
  refund(
    @CurrentUser() user: AuthPrincipal,
    @Body(new ZodValidationPipe(RefundSchema)) dto: RefundInput,
  ) {
    return this.refunds.refund(user, dto);
  }
}
