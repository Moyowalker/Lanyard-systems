import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { PaymentChannel, PaymentIntentStatus, PaymentProvider } from '@lanyard/contracts';

import { PaymentService } from './payment.service';
import {
  NormalizedCharge,
  PaymentInitializationError,
} from './provider/payment-provider.interface';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeIntent(
  overrides: Partial<{
    ourRef: string;
    providerRef: string;
    amountKobo: number;
    currency: string;
    status: PaymentIntentStatus;
    orderId: Types.ObjectId;
  }> = {},
) {
  return {
    _id: new Types.ObjectId(),
    ourRef: overrides.ourRef ?? 'LNYPAY_abc123',
    providerRef: overrides.providerRef ?? 'ps_ref_001',
    amountKobo: overrides.amountKobo ?? 500_000,
    currency: overrides.currency ?? 'NGN',
    status: overrides.status ?? PaymentIntentStatus.PENDING,
    orderId: overrides.orderId ?? new Types.ObjectId(),
    provider: PaymentProvider.PAYSTACK,
    lastWebhookEventId: undefined as string | undefined,
    save: jest.fn().mockResolvedValue(undefined),
  };
}

function makeCharge(overrides: Partial<NormalizedCharge> = {}): NormalizedCharge {
  return {
    reference: 'LNYPAY_abc123',
    providerRef: 'ps_ref_001',
    providerEventId: 'evt_001',
    status: 'success',
    amountKobo: 500_000,
    currency: 'NGN',
    channel: PaymentChannel.CARD,
    raw: {},
    ...overrides,
  };
}

function buildService(overrides: {
  intentFindOne?: jest.Mock;
  txnExists?: jest.Mock;
  txnCreate?: jest.Mock;
  orderModel?: Partial<{ findById: jest.Mock; updateOne: jest.Mock }>;
  customerFindById?: jest.Mock;
  provider?: Partial<{ initialize: jest.Mock; verify: jest.Mock; parseWebhook: jest.Mock }>;
}) {
  const intentFindOne = overrides.intentFindOne ?? jest.fn();
  const txnExists = overrides.txnExists ?? jest.fn().mockResolvedValue(null);
  const txnCreate = overrides.txnCreate ?? jest.fn().mockResolvedValue(undefined);
  const orderModel = {
    findById: jest.fn(),
    updateOne: jest.fn().mockResolvedValue(undefined),
    ...overrides.orderModel,
  };
  const provider = {
    key: PaymentProvider.PAYSTACK,
    initialize: jest.fn(),
    verify: jest.fn(),
    refund: jest.fn(),
    parseWebhook: jest.fn(),
    ...overrides.provider,
  };

  const service = new PaymentService(
    { findOne: intentFindOne } as never,
    { exists: txnExists, create: txnCreate } as never,
    orderModel as never,
    { findById: overrides.customerFindById ?? jest.fn() } as never,
    provider as never,
    { markPaid: jest.fn().mockResolvedValue(undefined) } as never,
    { notifyOrderEvent: jest.fn().mockResolvedValue(undefined) } as never,
    {
      record: jest.fn().mockResolvedValue(undefined),
    } as never,
    {
      run: jest.fn().mockImplementation(async (fn: (s: unknown) => Promise<unknown>) => fn(null)),
    } as never,
  );

  // Silence logger output in tests
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

  return { service, intentFindOne, txnExists, txnCreate, orderModel, provider };
}

describe('PaymentService.initialize', () => {
  it('uses a valid fallback email and surfaces Paystack rejections as validation errors', async () => {
    const customerId = new Types.ObjectId();
    const orderId = new Types.ObjectId();
    const initialize = jest
      .fn()
      .mockRejectedValue(
        new PaymentInitializationError(
          'Paystack initialize failed: Transaction amount is below the minimum',
          'Transaction amount is below the minimum',
        ),
      );
    const { service } = buildService({
      intentFindOne: jest.fn().mockResolvedValue(null),
      orderModel: {
        findById: jest.fn(),
        updateOne: jest.fn(),
      },
      customerFindById: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
      provider: { initialize },
    });
    (service as unknown as { orderModel: { findOne: jest.Mock } }).orderModel.findOne = jest
      .fn()
      .mockResolvedValue({
        _id: orderId,
        customerId,
        orderNo: 'LNY-1001',
        status: 'AWAITING_PAYMENT',
        totals: { totalKobo: 2_000, currency: 'NGN' },
      });

    await expect(
      service.initialize({ sub: customerId.toString() } as never, orderId.toString()),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Transaction amount is below the minimum',
    });
    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        email: `payments+${customerId.toString()}@lanyardpharmacy.com`,
      }),
    );
  });
});

// ── applyChargeEvent ──────────────────────────────────────────────────────────

describe('PaymentService.applyChargeEvent', () => {
  it('ignores a charge for an unknown reference', async () => {
    const { service, intentFindOne } = buildService({
      intentFindOne: jest.fn().mockResolvedValue(null),
    });

    const result = await service.applyChargeEvent(makeCharge());

    expect(result).toEqual({ status: 'ignored' });
    expect(intentFindOne).toHaveBeenCalled();
  });

  it('deduplicates a previously processed provider event (replay safety)', async () => {
    const intent = makeIntent();
    const { service, intentFindOne, txnExists } = buildService({
      intentFindOne: jest.fn().mockResolvedValue(intent),
      txnExists: jest.fn().mockResolvedValue({ _id: 'existing' }),
    });

    const result = await service.applyChargeEvent(makeCharge());

    expect(result).toEqual({ status: 'duplicate' });
    expect(txnExists).toHaveBeenCalledWith({ providerEventId: 'evt_001' });
  });

  it('rejects and fails the intent when amount does not match', async () => {
    const intent = makeIntent({ amountKobo: 500_000 });
    const { service } = buildService({
      intentFindOne: jest.fn().mockResolvedValue(intent),
      txnExists: jest.fn().mockResolvedValue(null),
    });

    await expect(
      service.applyChargeEvent(makeCharge({ amountKobo: 100_000 })),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(intent.status).toBe(PaymentIntentStatus.FAILED);
  });

  it('rejects and fails the intent when currency does not match', async () => {
    const intent = makeIntent({ currency: 'NGN' });
    const { service } = buildService({
      intentFindOne: jest.fn().mockResolvedValue(intent),
      txnExists: jest.fn().mockResolvedValue(null),
    });

    await expect(service.applyChargeEvent(makeCharge({ currency: 'USD' }))).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('marks intent SUCCEEDED and records txn on successful charge', async () => {
    const intent = makeIntent();
    const { service, txnCreate } = buildService({
      intentFindOne: jest.fn().mockResolvedValue(intent),
      txnExists: jest.fn().mockResolvedValue(null),
    });

    const result = await service.applyChargeEvent(makeCharge());

    expect(result).toEqual({ status: 'ok' });
    expect(intent.status).toBe(PaymentIntentStatus.SUCCEEDED);
    expect(txnCreate).toHaveBeenCalled();
  });

  it('marks intent FAILED on a failed charge event', async () => {
    const intent = makeIntent();
    const { service } = buildService({
      intentFindOne: jest.fn().mockResolvedValue(intent),
      txnExists: jest.fn().mockResolvedValue(null),
    });

    const result = await service.applyChargeEvent(makeCharge({ status: 'failed' }));

    expect(result).toEqual({ status: 'failed' });
    expect(intent.status).toBe(PaymentIntentStatus.FAILED);
  });
});

// ── reconcile ─────────────────────────────────────────────────────────────────

describe('PaymentService.reconcile', () => {
  it('settles a pending intent when verify returns success', async () => {
    const intent = makeIntent({ status: PaymentIntentStatus.PENDING });
    const applyMock = jest.fn().mockResolvedValue({ status: 'ok' });

    const { service, provider } = buildService({
      provider: {
        verify: jest.fn().mockResolvedValue({
          status: 'success',
          amountKobo: 500_000,
          currency: 'NGN',
          providerEventId: 'verify_999',
          raw: {},
        }),
      },
    });

    // Swap the internal applyChargeEvent to observe what reconcile calls it with.
    jest.spyOn(service, 'applyChargeEvent').mockImplementation(applyMock);

    // Stub intentModel.find via the private field.
    (service as unknown as { intentModel: { find: jest.Mock } }).intentModel = {
      find: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([intent]) }),
    };

    const result = await service.reconcile();

    expect(provider.verify).toHaveBeenCalledWith(intent.providerRef);
    expect(applyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        reference: intent.ourRef,
        status: 'success',
        amountKobo: 500_000,
      }),
    );
    expect(result).toEqual({ checked: 1, settled: 1 });
  });

  it('skips a pending intent when verify returns pending', async () => {
    const intent = makeIntent({ status: PaymentIntentStatus.PENDING });

    const { service, provider } = buildService({
      provider: {
        verify: jest.fn().mockResolvedValue({ status: 'pending', raw: {} }),
      },
    });

    const applySpy = jest.spyOn(service, 'applyChargeEvent');

    (service as unknown as { intentModel: { find: jest.Mock } }).intentModel = {
      find: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([intent]) }),
    };

    const result = await service.reconcile();

    expect(applySpy).not.toHaveBeenCalled();
    expect(result).toEqual({ checked: 1, settled: 0 });
  });

  it('returns zero when no pending intents exist', async () => {
    const { service } = buildService({
      provider: { verify: jest.fn() },
    });

    (service as unknown as { intentModel: { find: jest.Mock } }).intentModel = {
      find: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) }),
    };

    const result = await service.reconcile();
    expect(result).toEqual({ checked: 0, settled: 0 });
  });
});
