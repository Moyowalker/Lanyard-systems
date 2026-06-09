import { createHmac, timingSafeEqual } from 'node:crypto';
import { PaymentChannel, PaymentProvider } from '@lanyard/contracts';

import {
  NormalizedCharge,
  PaymentInitParams,
  PaymentInitResult,
  PaymentProviderPort,
  RefundResult,
  VerifyResult,
} from './payment-provider.interface';

const PAYSTACK_BASE = 'https://api.paystack.co';

/**
 * Real Paystack adapter. Amounts are in kobo (Paystack's smallest unit), matching our
 * storage. Webhooks are HMAC-SHA512 verified against the secret key — the ONLY authority
 * on payment success (docs/architecture/03 §6, doc 10 R6).
 */
export class PaystackProvider implements PaymentProviderPort {
  readonly key = PaymentProvider.PAYSTACK;

  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string = secretKey,
  ) {}

  async initialize(params: PaymentInitParams): Promise<PaymentInitResult> {
    const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        amount: params.amountKobo,
        email: params.email,
        reference: params.reference,
        currency: params.currency,
        metadata: params.metadata,
      }),
    });
    const json = (await res.json()) as {
      status: boolean;
      message: string;
      data?: { reference: string; authorization_url: string };
    };
    if (!res.ok || !json.status || !json.data) {
      throw new Error(`Paystack initialize failed: ${json.message ?? res.statusText}`);
    }
    return { providerRef: json.data.reference, authorizationUrl: json.data.authorization_url };
  }

  async verify(reference: string): Promise<VerifyResult> {
    const res = await fetch(
      `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: { authorization: `Bearer ${this.secretKey}` },
      },
    );
    const json = (await res.json()) as {
      status: boolean;
      data?: { id: number; status: string; amount: number; currency: string; channel?: string };
    };
    const d = json.data;
    if (!res.ok || !json.status || !d)
      return { status: 'failed', raw: json as Record<string, unknown> };
    return {
      status: d.status === 'success' ? 'success' : d.status === 'failed' ? 'failed' : 'pending',
      amountKobo: d.amount,
      currency: d.currency,
      channel: this.mapChannel(d.channel),
      providerEventId: `verify_${d.id}`,
      raw: json as Record<string, unknown>,
    };
  }

  async refund(providerRef: string, amountKobo: number): Promise<RefundResult> {
    const res = await fetch(`${PAYSTACK_BASE}/refund`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.secretKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ transaction: providerRef, amount: amountKobo }),
    });
    const json = (await res.json()) as {
      status: boolean;
      data?: { id: number; status: string };
    };
    if (!res.ok || !json.status || !json.data) {
      return { status: 'failed', raw: json as Record<string, unknown> };
    }
    // Paystack refunds are async ("pending"/"processing") then settle via webhook.
    const settled = json.data.status === 'processed';
    return {
      status: settled ? 'done' : 'processing',
      providerRefundRef: String(json.data.id),
      raw: json as Record<string, unknown>,
    };
  }

  parseWebhook(signature: string | undefined, rawBody: Buffer): NormalizedCharge | null {
    if (!signature) throw new Error('Missing Paystack signature');
    const expected = createHmac('sha512', this.webhookSecret).update(rawBody).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new Error('Invalid Paystack signature');
    }
    const event = JSON.parse(rawBody.toString('utf8')) as {
      event: string;
      data: {
        id: number;
        reference: string;
        status: string;
        amount: number;
        currency: string;
        channel?: string;
      };
    };
    if (event.event !== 'charge.success') return null;
    const d = event.data;
    return {
      reference: d.reference,
      providerRef: d.reference,
      providerEventId: `evt_${d.id}`,
      status: d.status === 'success' ? 'success' : 'failed',
      amountKobo: d.amount,
      currency: d.currency,
      channel: this.mapChannel(d.channel),
      raw: event as unknown as Record<string, unknown>,
    };
  }

  private mapChannel(channel?: string): PaymentChannel | undefined {
    switch (channel) {
      case 'card':
        return PaymentChannel.CARD;
      case 'bank':
      case 'bank_transfer':
        return PaymentChannel.BANK_TRANSFER;
      case 'ussd':
        return PaymentChannel.USSD;
      default:
        return undefined;
    }
  }
}
