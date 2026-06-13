import { OrderPaymentStatus } from '@lanyard/contracts';
import { summarizeSales, OrderForReport } from './reports.service';

describe('summarizeSales', () => {
  const from = new Date('2026-06-01T00:00:00.000Z');
  const to = new Date('2026-06-03T00:00:00.000Z');

  function order(partial: Partial<OrderForReport>): OrderForReport {
    return {
      createdAt: '2026-06-01T10:00:00.000Z',
      requiresRxVerification: false,
      payment: { status: OrderPaymentStatus.PAID },
      totals: { totalKobo: 100000 },
      items: [{ productId: 'p1', name: 'Paracetamol', quantity: 1, lineTotalKobo: 100000 }],
      ...partial,
    };
  }

  it('counts revenue from PAID orders only and computes AOV', () => {
    const result = summarizeSales(
      [
        order({ totals: { totalKobo: 100000 } }),
        order({ totals: { totalKobo: 300000 } }),
        order({ payment: { status: OrderPaymentStatus.UNPAID }, totals: { totalKobo: 999000 } }),
      ],
      from,
      to,
    );
    expect(result.paidOrders).toBe(2);
    expect(result.revenueKobo).toBe(400000);
    expect(result.aovKobo).toBe(200000);
  });

  it('separates Rx vs OTC and reports refunds independently', () => {
    const result = summarizeSales(
      [
        order({ requiresRxVerification: true }),
        order({ requiresRxVerification: false }),
        order({ payment: { status: OrderPaymentStatus.REFUNDED }, totals: { totalKobo: 50000 } }),
      ],
      from,
      to,
    );
    expect(result.rxOrders).toBe(1);
    expect(result.otcOrders).toBe(1);
    expect(result.refunds).toBe(1);
    expect(result.refundedKobo).toBe(50000);
  });

  it('buckets revenue by day across the full range (zero-filled)', () => {
    const result = summarizeSales(
      [
        order({ createdAt: '2026-06-01T08:00:00.000Z', totals: { totalKobo: 100000 } }),
        order({ createdAt: '2026-06-03T20:00:00.000Z', totals: { totalKobo: 200000 } }),
      ],
      from,
      to,
    );
    expect(result.byDay).toHaveLength(3); // 1st, 2nd, 3rd
    expect(result.byDay[0]).toEqual({ date: '2026-06-01', revenueKobo: 100000, orders: 1 });
    expect(result.byDay[1]).toEqual({ date: '2026-06-02', revenueKobo: 0, orders: 0 });
    expect(result.byDay[2]).toEqual({ date: '2026-06-03', revenueKobo: 200000, orders: 1 });
  });

  it('ranks top products by revenue', () => {
    const result = summarizeSales(
      [
        order({
          items: [
            { productId: 'a', name: 'A', quantity: 1, lineTotalKobo: 100000 },
            { productId: 'b', name: 'B', quantity: 2, lineTotalKobo: 500000 },
          ],
        }),
        order({
          items: [{ productId: 'a', name: 'A', quantity: 3, lineTotalKobo: 300000 }],
        }),
      ],
      from,
      to,
    );
    // Sorted by revenue desc: B (500000) outranks A (100000 + 300000 = 400000).
    expect(result.topProducts[0]).toEqual({
      productId: 'b',
      name: 'B',
      quantity: 2,
      revenueKobo: 500000,
    });
    expect(result.topProducts[1]).toEqual({
      productId: 'a',
      name: 'A',
      quantity: 4,
      revenueKobo: 400000,
    });
  });
});
