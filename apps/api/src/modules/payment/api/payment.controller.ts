import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InitPaymentInput, InitPaymentSchema } from '@lanyard/contracts';

import { CurrentUser, RequireRealm } from '../../../core/auth/auth.decorators';
import { RealmGuard } from '../../../core/auth/authz.guards';
import { AuthPrincipal } from '../../../core/auth/principal';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe';
import { PaymentService } from '../application/payment.service';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
@UseGuards(RealmGuard)
@RequireRealm('customer')
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  @Post('intents')
  initialize(
    @CurrentUser() user: AuthPrincipal,
    @Body(new ZodValidationPipe(InitPaymentSchema)) dto: InitPaymentInput,
  ) {
    return this.payments.initialize(user, dto.orderId);
  }

  @Get('intents/:id')
  getIntent(@CurrentUser() user: AuthPrincipal, @Param('id') id: string) {
    return this.payments.getIntent(user, id);
  }
}
