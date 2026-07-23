import { PaymentChannel, PaymentProvider } from '@lanyard/contracts';

export interface PaymentInitParams {
  amountKobo: number;
  currency: string;
  email: string;
  reference: string; // our reference
  metadata?: Record<string, unknown>;
}

export interface PaymentInitResult {
  providerRef?: string;
  authorizationUrl: string;
}

export class PaymentInitializationError extends Error {
  constructor(
    message: string,
    public readonly customerMessage: string,
  ) {
    super(message);
    this.name = 'PaymentInitializationError';
  }
}

/** Normalised, provider-agnostic charge event (from webhook or verify). */
export interface NormalizedCharge {
  reference: string; // our reference
  providerRef?: string;
  providerEventId: string; // unique per provider event — the idempotency key
  status: 'success' | 'failed' | 'pending';
  amountKobo: number;
  currency: string;
  channel?: PaymentChannel;
  raw: Record<string, unknown>;
}

export interface VerifyResult {
  status: 'success' | 'failed' | 'pending';
  amountKobo?: number;
  currency?: string;
  channel?: PaymentChannel;
  providerEventId?: string;
  raw: Record<string, unknown>;
}

export interface RefundResult {
  status: 'done' | 'processing' | 'failed';
  providerRefundRef?: string;
  raw: Record<string, unknown>;
}

/**
 * Payment provider port. Concrete adapters (Paystack, Flutterwave later) implement it,
 * so the rest of the platform never depends on a specific processor (doc 03 §6).
 */
export interface PaymentProviderPort {
  readonly key: PaymentProvider;
  initialize(params: PaymentInitParams): Promise<PaymentInitResult>;
  verify(reference: string): Promise<VerifyResult>;
  /** Refund (full or partial) a previously successful charge, by provider reference. */
  refund(providerRef: string, amountKobo: number): Promise<RefundResult>;
  /** Verify the signature and normalise a webhook; returns null if not a charge event. */
  parseWebhook(signature: string | undefined, rawBody: Buffer): NormalizedCharge | null;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
