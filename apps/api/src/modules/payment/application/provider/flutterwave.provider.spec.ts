import { PaymentChannel, PaymentProvider } from '@lanyard/contracts';

import { FlutterwaveProvider } from './flutterwave.provider';

describe('FlutterwaveProvider', () => {
  const provider = new FlutterwaveProvider('flw_secret', 'webhook_hash');

  it('normalizes charge.completed webhooks', () => {
    const payload = Buffer.from(
      JSON.stringify({
        event: 'charge.completed',
        data: {
          id: 12345,
          tx_ref: 'LNYPAY_abc123',
          flw_ref: 'FLW_REF',
          status: 'successful',
          amount: 5000,
          currency: 'NGN',
          payment_type: 'bank_transfer',
        },
      }),
    );

    const event = provider.parseWebhook('webhook_hash', payload);

    expect(provider.key).toBe(PaymentProvider.FLUTTERWAVE);
    expect(event).toEqual(
      expect.objectContaining({
        reference: 'LNYPAY_abc123',
        providerRef: 'LNYPAY_abc123',
        providerEventId: 'evt_12345',
        status: 'success',
        amountKobo: 500_000,
        currency: 'NGN',
        channel: PaymentChannel.BANK_TRANSFER,
      }),
    );
  });

  it('rejects webhooks with an invalid verification hash', () => {
    const payload = Buffer.from(JSON.stringify({ event: 'charge.completed', data: {} }));

    expect(() => provider.parseWebhook('wrong_hash', payload)).toThrow(
      'Invalid Flutterwave signature',
    );
  });
});
