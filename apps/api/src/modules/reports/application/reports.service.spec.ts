import { OrderPaymentStatus } from '@lanyard/contracts';
import {
  summarizeSales,
  buildInventoryValuation,
  buildConsumption,
  OrderForReport,
} from './reports.service';

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

describe('buildInventoryValuation', () => {
  it('values stock at cost and selling price with totals', () => {
    const items = [
      { productId: 'a', branchId: 'b1', onHand: 10, reserved: 2 },
      { productId: 'c', branchId: 'b1', onHand: 5, reserved: 0 },
    ];
    const products = new Map([
      ['a', { name: 'Paracetamol', sku: 'PARA-1' }],
      ['c', { name: 'Ibuprofen' }],
    ]);
    const prices = new Map([
      ['b1:a', { costKobo: 1000, priceKobo: 1500 }],
      ['b1:c', { costKobo: 2000, priceKobo: 3000 }],
    ]);

    const report = buildInventoryValuation(items, products, prices);

    expect(report.totalDrugs).toBe(2);
    expect(report.totalQuantity).toBe(15);
    expect(report.totalCostKobo).toBe(10 * 1000 + 5 * 2000); // 20000
    expect(report.totalSellingKobo).toBe(10 * 1500 + 5 * 3000); // 30000
    // Sorted by stock-selling value desc: A (15000) before C (15000 too) — stable on equal.
    const rowA = report.rows.find((r) => r.productId === 'a');
    expect(rowA?.available).toBe(8);
    expect(rowA?.sku).toBe('PARA-1');
    expect(rowA?.stockCostKobo).toBe(10000);
  });

  it('treats a missing price as zero value', () => {
    const report = buildInventoryValuation(
      [{ productId: 'x', branchId: 'b1', onHand: 4, reserved: 0 }],
      new Map([['x', { name: 'Unpriced' }]]),
      new Map(),
    );
    expect(report.rows[0].stockCostKobo).toBe(0);
    expect(report.rows[0].stockSellingKobo).toBe(0);
    expect(report.totalSellingKobo).toBe(0);
  });
});

describe('buildConsumption', () => {
  const from = new Date('2026-06-01T00:00:00.000Z');
  const to = new Date('2026-06-30T00:00:00.000Z');

  it('builds rows sorted by units dispensed with value at selling price', () => {
    const agg = [
      { productId: 'a', unitsDispensed: 5, movements: 2 },
      { productId: 'b', unitsDispensed: 12, movements: 4 },
    ];
    const products = new Map([
      ['a', { name: 'A' }],
      ['b', { name: 'B' }],
    ]);
    const prices = new Map<string, number | undefined>([
      ['a', 1000],
      ['b', 500],
    ]);

    const report = buildConsumption(agg, products, prices, from, to);

    expect(report.rows[0].productId).toBe('b'); // 12 units outranks 5
    expect(report.totalUnits).toBe(17);
    expect(report.totalValueKobo).toBe(5 * 1000 + 12 * 500); // 11000
  });
});
