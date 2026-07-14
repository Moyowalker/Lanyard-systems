import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PaymentProvider } from '@lanyard/contracts';

import { OrderModule } from '../order/order.module';
import { PaymentService } from './application/payment.service';
import { RefundService } from './application/refund.service';
import { PaymentController } from './api/payment.controller';
import { PaymentWebhookController } from './api/payment-webhook.controller';
import { AdminPaymentController } from './api/admin-payment.controller';
import { PaymentReconcileProcessor } from './jobs/payment-reconcile.processor';
import { PAYMENT_PROVIDER } from './application/provider/payment-provider.interface';
import { PaystackProvider } from './application/provider/paystack.provider';
import { FlutterwaveProvider } from './application/provider/flutterwave.provider';
import { MockPaymentProvider } from './application/provider/mock.provider';
import { PAYMENT_RECONCILE_QUEUE } from '../../core/queue/queue.constants';

/**
 * Payments. Provider is selected at boot: configured real provider when its secret is set,
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
        const provider = config.get<string>('PAYMENT_PROVIDER', 'paystack');
        if (provider === 'flutterwave') {
          const secret = config.get<string>('FLUTTERWAVE_SECRET_KEY');
          const webhookSecret = config.get<string>('FLUTTERWAVE_WEBHOOK_SECRET');
          return secret && webhookSecret
            ? new FlutterwaveProvider(secret, webhookSecret)
            : new MockPaymentProvider(PaymentProvider.FLUTTERWAVE);
        }

        const secret = config.get<string>('PAYSTACK_SECRET_KEY');
        const webhookSecret = config.get<string>('PAYSTACK_WEBHOOK_SECRET');
        return secret
          ? new PaystackProvider(secret, webhookSecret ?? secret)
          : new MockPaymentProvider(PaymentProvider.PAYSTACK);
      },
    },
  ],
  // PaymentService + RefundService are exported for the POS module (offline counter
  // payments and till returns).
  exports: [PaymentService, RefundService],
})
export class PaymentModule {}
