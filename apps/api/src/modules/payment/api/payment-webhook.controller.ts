import {
  Controller,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  RawBodyRequest,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request } from 'express';

import { Public } from '../../../core/auth/auth.decorators';
import { PaymentService } from '../application/payment.service';

/**
 * Unauthenticated but signature-verified provider callbacks, plus a dev-only confirm
 * endpoint. Webhooks are the ONLY authority on payment success (doc 10 R6).
 */
@ApiExcludeController()
@Controller()
export class PaymentWebhookController {
  constructor(
    private readonly payments: PaymentService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('webhooks/paystack')
  @HttpCode(200)
  async paystack(@Req() req: RawBodyRequest<Request>) {
    const signature = req.headers['x-paystack-signature'] as string | undefined;
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    return this.payments.handleWebhook(signature, raw);
  }

  /** Dev/test only: simulate a successful charge (disabled in production). */
  @Public()
  @Post('payments/dev/confirm/:intentId')
  @HttpCode(200)
  async devConfirm(@Param('intentId') intentId: string) {
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new NotFoundException();
    }
    return this.payments.devConfirm(intentId);
  }
}
