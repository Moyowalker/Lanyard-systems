import { PaymentChannel, PaymentProvider } from '@lanyard/contracts';

import {
  NormalizedCharge,
  PaymentInitParams,
  PaymentInitResult,
  PaymentProviderPort,
  RefundResult,
  VerifyResult,
} from './payment-provider.interface';

const FLUTTERWAVE_BASE = 'https://api.flutterwave.com/v3';

type FlutterwaveStatus = 'successful' | 'failed' | 'cancelled' | string;

interface FlutterwaveTransaction {
  id: number;
  tx_ref: string;
  flw_ref?: string;
  status: FlutterwaveStatus;
  amount: number;
  currency: string;
  payment_type?: string;
}

/** Flutterwave adapter. Amounts are stored in kobo internally; Flutterwave expects NGN units. */
export class FlutterwaveProvider implements PaymentProviderPort {
  readonly key = PaymentProvider.FLUTTERWAVE;

  constructor(
    private readonly secretKey: string,
    private readonly webhookSecret: string,
  ) {}

  async initialize(params: PaymentInitParams): Promise<PaymentInitResult> {
    const res = await fetch(`${FLUTTERWAVE_BASE}/payments`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        tx_ref: params.reference,
        amount: params.amountKobo / 100,
        currency: params.currency,
        customer: { email: params.email },
        meta: params.metadata,
      }),
    });
    const json = (await res.json()) as {
      status: string;
      message: string;
      data?: { link: string };
    };
    if (!res.ok || json.status !== 'success' || !json.data?.link) {
      throw new Error(`Flutterwave initialize failed: ${json.message ?? res.statusText}`);
    }
    return { providerRef: params.reference, authorizationUrl: json.data.link };
  }

  async verify(reference: string): Promise<VerifyResult> {
    const res = await fetch(
      `${FLUTTERWAVE_BASE}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`,
      { headers: { authorization: `Bearer ${this.secretKey}` } },
    );
    const json = (await res.json()) as {
      status: string;
      data?: FlutterwaveTransaction;
    };
    const d = json.data;
    if (!res.ok || json.status !== 'success' || !d) {
      return { status: 'failed', raw: json as Record<string, unknown> };
    }
    return {
      status: this.mapStatus(d.status),
      amountKobo: Math.round(Number(d.amount) * 100),
      currency: d.currency,
      channel: this.mapChannel(d.payment_type),
      providerEventId: `verify_${d.id}`,
      raw: json as Record<string, unknown>,
    };
  }

  async refund(providerRef: string, amountKobo: number): Promise<RefundResult> {
    const verify = await this.verify(providerRef);
    const transactionId = this.transactionIdFromRaw(verify.raw);
    if (!transactionId) return { status: 'failed', raw: verify.raw };

    const res = await fetch(`${FLUTTERWAVE_BASE}/transactions/${transactionId}/refund`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ amount: amountKobo / 100 }),
    });
    const json = (await res.json()) as {
      status: string;
      data?: { id: number; status: string };
    };
    if (!res.ok || json.status !== 'success' || !json.data) {
      return { status: 'failed', raw: json as Record<string, unknown> };
    }
    return {
      status: json.data.status === 'completed' ? 'done' : 'processing',
      providerRefundRef: String(json.data.id),
      raw: json as Record<string, unknown>,
    };
  }

  parseWebhook(signature: string | undefined, rawBody: Buffer): NormalizedCharge | null {
    if (!signature) throw new Error('Missing Flutterwave signature');
    if (signature !== this.webhookSecret) throw new Error('Invalid Flutterwave signature');

    const event = JSON.parse(rawBody.toString('utf8')) as {
      event: string;
      data: FlutterwaveTransaction;
    };
    if (event.event !== 'charge.completed') return null;

    const d = event.data;
    return {
      reference: d.tx_ref,
      providerRef: d.tx_ref,
      providerEventId: `evt_${d.id}`,
      status: this.mapStatus(d.status),
      amountKobo: Math.round(Number(d.amount) * 100),
      currency: d.currency,
      channel: this.mapChannel(d.payment_type),
      raw: event as unknown as Record<string, unknown>,
    };
  }

  private mapStatus(status: FlutterwaveStatus): 'success' | 'failed' | 'pending' {
    if (status === 'successful') return 'success';
    if (status === 'failed' || status === 'cancelled') return 'failed';
    return 'pending';
  }

  private mapChannel(channel?: string): PaymentChannel | undefined {
    switch (channel) {
      case 'card':
        return PaymentChannel.CARD;
      case 'bank_transfer':
      case 'account':
        return PaymentChannel.BANK_TRANSFER;
      case 'ussd':
        return PaymentChannel.USSD;
      default:
        return undefined;
    }
  }

  private transactionIdFromRaw(raw: Record<string, unknown>): number | undefined {
    const data = raw.data as { id?: unknown } | undefined;
    return typeof data?.id === 'number' ? data.id : undefined;
  }
}
