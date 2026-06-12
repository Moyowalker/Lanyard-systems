import {
  Controller,
  HttpCode,
  Logger,
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
 *
 * IMPORTANT: Paystack retries any non-200 response. We ALWAYS return 200 — invalid
 * signatures are logged as security events but acknowledged so retries don't pile up.
 */
@ApiExcludeController()
@Controller()
export class PaymentWebhookController {
  private readonly logger = new Logger(PaymentWebhookController.name);

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
    try {
      return await this.payments.handleWebhook(signature, raw);
    } catch (err) {
      // Signature failure or parse error: log security event, acknowledge to stop retries.
      this.logger.warn(`Webhook rejected: ${(err as Error).message}`);
      return { status: 'rejected' };
    }
  }

  /** Dev/test only: simulate a successful charge (disabled in production). */
  @Public()
  @Post('payments/dev/confirm/:intentId')
  @HttpCode(200)
  async devConfirm(@Param('intentId') intentId: string) {
    if (
      this.config.get<string>('NODE_ENV') === 'production' ||
      !this.config.get<boolean>('ENABLE_DEV_PAYMENT_CONFIRM', false)
    ) {
      throw new NotFoundException();
    }
    return this.payments.devConfirm(intentId);
  }
}
