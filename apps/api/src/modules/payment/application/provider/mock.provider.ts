import { Logger } from '@nestjs/common';
import { PaymentProvider } from '@lanyard/contracts';

import {
  NormalizedCharge,
  PaymentInitParams,
  PaymentInitResult,
  PaymentProviderPort,
  RefundResult,
  VerifyResult,
} from './payment-provider.interface';

/**
 * Dev/test provider used when no selected-provider secret is configured. `initialize` returns a
 * local reference without any external call; settlement is driven in dev via the
 * `/payments/dev/confirm/:intentId` endpoint, which exercises the SAME settlement path
 * as the real webhook. Never selected when the selected provider is fully configured.
 */
export class MockPaymentProvider implements PaymentProviderPort {
  private readonly logger = new Logger(MockPaymentProvider.name);

  constructor(readonly key = PaymentProvider.PAYSTACK) {}

  initialize(params: PaymentInitParams): Promise<PaymentInitResult> {
    this.logger.warn(`MOCK payment initialize for ${params.reference} (no provider configured)`);
    return Promise.resolve({
      providerRef: `mock_${params.reference}`,
      authorizationUrl: `https://mock-checkout.local/pay/${params.reference}`,
    });
  }

  verify(): Promise<VerifyResult> {
    // Mock cannot verify against a real provider; reconciliation is a no-op in dev.
    return Promise.resolve({ status: 'pending', raw: { mock: true } });
  }

  refund(providerRef: string, amountKobo: number): Promise<RefundResult> {
    this.logger.warn(`MOCK refund of ${amountKobo} kobo for ${providerRef}`);
    return Promise.resolve({
      status: 'done',
      providerRefundRef: `mock_refund_${providerRef}`,
      raw: { mock: true },
    });
  }

  parseWebhook(): NormalizedCharge | null {
    return null;
  }
}
