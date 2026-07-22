import { createHmac } from 'node:crypto';
import { PaystackProvider } from './paystack.provider';

const SECRET = 'test-secret-key';
const provider = new PaystackProvider(SECRET);

function sign(body: object): { raw: Buffer; sig: string } {
  const raw = Buffer.from(JSON.stringify(body));
  const sig = createHmac('sha512', SECRET).update(raw).digest('hex');
  return { raw, sig };
}

// ── parseWebhook ──────────────────────────────────────────────────────────────

describe('PaystackProvider.parseWebhook', () => {
  const chargeBody = {
    event: 'charge.success',
    data: {
      id: 123456,
      reference: 'LNYPAY_abc123',
      status: 'success',
      amount: 500000,
      currency: 'NGN',
      channel: 'card',
    },
  };

  it('normalises a valid charge.success event', () => {
    const { raw, sig } = sign(chargeBody);
    const result = provider.parseWebhook(sig, raw);

    expect(result).toMatchObject({
      reference: 'LNYPAY_abc123',
      providerEventId: 'evt_123456',
      status: 'success',
      amountKobo: 500000,
      currency: 'NGN',
    });
  });

  it('throws for a missing signature', () => {
    const { raw } = sign(chargeBody);
    expect(() => provider.parseWebhook(undefined, raw)).toThrow('Missing Paystack signature');
  });

  it('throws for a tampered signature', () => {
    const { raw } = sign(chargeBody);
    expect(() => provider.parseWebhook('deadbeef', raw)).toThrow('Invalid Paystack signature');
  });

  it('returns null for non-charge events (e.g. transfer.success)', () => {
    const body = { event: 'transfer.success', data: {} };
    const { raw, sig } = sign(body);
    expect(provider.parseWebhook(sig, raw)).toBeNull();
  });

  it('maps providerEventId consistently for replay dedup', () => {
    // Same event id must produce the same providerEventId on every call.
    const { raw: r1, sig: s1 } = sign(chargeBody);
    const { raw: r2, sig: s2 } = sign(chargeBody);
    expect(provider.parseWebhook(s1, r1)?.providerEventId).toBe(
      provider.parseWebhook(s2, r2)?.providerEventId,
    );
  });

});

// ── verify ────────────────────────────────────────────────────────────────────

describe('PaystackProvider.verify', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('returns success result with normalised fields', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: true,
        data: {
          id: 99,
          status: 'success',
          amount: 500000,
          currency: 'NGN',
          channel: 'card',
        },
      }),
    });

    const result = await provider.verify('LNYPAY_abc123');

    expect(result).toMatchObject({
      status: 'success',
      amountKobo: 500000,
      currency: 'NGN',
      providerEventId: 'verify_99',
    });
  });

  it('returns failed when provider reports a failed transaction', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: true,
        data: { id: 1, status: 'failed', amount: 500000, currency: 'NGN' },
      }),
    });

    const result = await provider.verify('LNYPAY_abc123');
    expect(result.status).toBe('failed');
  });
});
