import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { syncOfflineSales } from './sync';
import {
  configureOfflinePin,
  enqueueSale,
  getDeviceId,
  listQueuedSales,
  lockOfflinePos,
  resetOfflinePos,
  unlockOfflinePos,
  type OfflineQueuedSale,
} from './vault';

function queuedSale(): OfflineQueuedSale {
  const capturedAt = new Date().toISOString();
  return {
    id: '3f9a4a9c-1111-4222-8333-444455556666',
    branchId: '507f1f77bcf86cd799439011',
    capturedAt,
    request: {
      branchId: '507f1f77bcf86cd799439011',
      items: [{ productId: '507f191e810c19729de860ea', quantity: 1 }],
      payments: [{ channel: 'cash' as never, amountKobo: 1200 }],
      idempotencyKey: '3f9a4a9c-1111-4222-8333-444455556666',
    },
    lines: [
      {
        productId: '507f191e810c19729de860ea',
        name: 'Paracetamol',
        form: 'tablet',
        unitPriceKobo: 1200,
        quantity: 1,
      },
    ],
    totalKobo: 1200,
    status: 'pending',
    attempts: 0,
  };
}

beforeEach(async () => {
  await resetOfflinePos();
  await configureOfflinePin('123456');
});

afterEach(async () => {
  vi.restoreAllMocks();
  await resetOfflinePos();
});

describe('offline POS vault', () => {
  it('requires the configured PIN after locking and preserves encrypted data', async () => {
    const firstDeviceId = await getDeviceId();
    lockOfflinePos();

    await expect(unlockOfflinePos('000000')).rejects.toThrow('Invalid offline PIN');
    await unlockOfflinePos('123456');

    expect(await getDeviceId()).toBe(firstDeviceId);
  });

  it('persists a queued sale exactly once', async () => {
    const sale = queuedSale();
    await Promise.all([enqueueSale(sale), enqueueSale(sale)]);

    expect(await listQueuedSales()).toEqual([sale]);
  });
});

describe('offline POS synchronization', () => {
  it('removes a sale only after the server confirms it', async () => {
    await enqueueSale(queuedSale());
    const serverSale = {
      orderId: '507f1f77bcf86cd799439099',
      orderNo: 'LNY-TEST',
      branchId: '507f1f77bcf86cd799439011',
      items: [],
      totals: { subtotalKobo: 1200, discountKobo: 0, totalKobo: 1200, currency: 'NGN' },
      payment: { channel: 'cash', paidAt: new Date().toISOString() },
      payments: [{ channel: 'cash', amountKobo: 1200 }],
      cashier: { id: '507f1f77bcf86cd799439012' },
      createdAt: new Date().toISOString(),
    };
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(serverSale), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await syncOfflineSales(fetcher);

    expect(result.synced).toEqual([serverSale]);
    expect(await listQueuedSales()).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('retains a validation conflict for manager resolution', async () => {
    await enqueueSale(queuedSale());
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: 'CONFLICT', message: 'Insufficient stock' } }),
        { status: 409, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await syncOfflineSales(fetcher);
    const [retained] = await listQueuedSales();

    expect(result.conflicts).toHaveLength(1);
    expect(retained.status).toBe('conflict');
    expect(retained.conflict?.message).toBe('Insufficient stock');
  });
});