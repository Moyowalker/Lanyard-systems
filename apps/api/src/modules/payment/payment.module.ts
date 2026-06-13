import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

import { OrderModule } from '../order/order.module';
import { PaymentService } from './application/payment.service';
import { RefundService } from './application/refund.service';
import { PaymentController } from './api/payment.controller';
import { PaymentWebhookController } from './api/payment-webhook.controller';
import { AdminPaymentController } from './api/admin-payment.controller';
import { PaymentReconcileProcessor } from './jobs/payment-reconcile.processor';
import { PAYMENT_PROVIDER } from './application/provider/payment-provider.interface';
import { PaystackProvider } from './application/provider/paystack.provider';
import { MockPaymentProvider } from './application/provider/mock.provider';
import { PAYMENT_RECONCILE_QUEUE } from '../../core/queue/queue.constants';

/**
 * Payments. Provider is selected at boot: real Paystack when PAYSTACK_SECRET_KEY is set,
 * otherwise a dev mock. Imports OrderModule to settle orders (markPaid). Models come from
 * the global ModelsModule.
 */
@Module({
  imports: [OrderModule, BullModule.registerQueue({ name: PAYMENT_RECONCILE_QUEUE })],
  controllers: [PaymentController, PaymentWebhookController, AdminPaymentController],
  providers: [
    PaymentService,
    RefundService,
    PaymentReconcileProcessor,
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('PAYSTACK_SECRET_KEY');
        const webhookSecret = config.get<string>('PAYSTACK_WEBHOOK_SECRET');
        return secret
          ? new PaystackProvider(secret, webhookSecret ?? secret)
          : new MockPaymentProvider();
      },
    },
  ],
})
export class PaymentModule {}
