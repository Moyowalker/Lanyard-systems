import { OrderPaymentStatus } from '@lanyard/contracts';
import {
  summarizeSales,
  buildInventoryValuation,
  buildConsumption,
  buildLowStock,
  buildExpiring,
  buildPaymentBreakdown,
  OrderForPaymentBreakdown,
  OrderForReport,
} from './reports.service';

describe('buildPaymentBreakdown', () => {
  const channel = (rows: ReturnType<typeof buildPaymentBreakdown>, key: string) =>
    rows.find((r) => r.channel === key);

  function sale(partial: Partial<OrderForPaymentBreakdown>): OrderForPaymentBreakdown {
    return {
      totals: { totalKobo: 100000 },
      payment: { status: OrderPaymentStatus.PAID },
      ...partial,
    };
  }

  it('buckets a single-channel counter sale', () => {
    const rows = buildPaymentBreakdown([
      sale({
        counterSale: {
          paymentChannel: 'cash',
          payments: [{ channel: 'cash', amountKobo: 100000 }],
        },
      }),
    ]);
    expect(channel(rows, 'cash')).toEqual({ channel: 'cash', totalKobo: 100000, orders: 1 });
  });

  it('buckets an order with no counter sale as online', () => {
    const rows = buildPaymentBreakdown([sale({})]);
    expect(channel(rows, 'online')).toEqual({ channel: 'online', totalKobo: 100000, orders: 1 });
  });

  // Regression: an HMO+cash copay used to count 1 cash order and 0 HMO orders.
  it('counts a split sale once against EVERY channel it used', () => {
    const rows = buildPaymentBreakdown([
      sale({
        totals: { totalKobo: 100000 },
        counterSale: {
          paymentChannel: 'hmo',
          payments: [
            { channel: 'hmo', amountKobo: 70000 },
            { channel: 'cash', amountKobo: 30000 },
          ],
        },
      }),
    ]);
    expect(channel(rows, 'hmo')).toEqual({ channel: 'hmo', totalKobo: 70000, orders: 1 });
    expect(channel(rows, 'cash')).toEqual({ channel: 'cash', totalKobo: 30000, orders: 1 });
  });

  it('counts a channel once even when it appears twice in one split', () => {
    const rows = buildPaymentBreakdown([
      sale({
        counterSale: {
          paymentChannel: 'cash',
          payments: [
            { channel: 'cash', amountKobo: 60000 },
            { channel: 'cash', amountKobo: 40000 },
          ],
        },
      }),
    ]);
    expect(channel(rows, 'cash')).toEqual({ channel: 'cash', totalKobo: 100000, orders: 1 });
  });

  // Regression: refunded orders were dropped entirely, overstating takings.
  it('nets a fully refunded order down to zero but still counts it', () => {
    const rows = buildPaymentBreakdown([
      sale({
        payment: { status: OrderPaymentStatus.REFUNDED },
        counterSale: {
          paymentChannel: 'cash',
          payments: [{ channel: 'cash', amountKobo: 100000 }],
        },
      }),
    ]);
    expect(channel(rows, 'cash')).toEqual({ channel: 'cash', totalKobo: 0, orders: 1 });
  });

  it('nets a partially returned counter sale down by the refunded amount', () => {
    const rows = buildPaymentBreakdown([
      sale({
        counterSale: {
          paymentChannel: 'cash',
          payments: [{ channel: 'cash', amountKobo: 100000 }],
          returns: [{ refundKobo: 25000 }],
        },
      }),
    ]);
    expect(channel(rows, 'cash')).toEqual({ channel: 'cash', totalKobo: 75000, orders: 1 });
  });

  it('spreads a refund across split tenders in proportion to each share', () => {
    const rows = buildPaymentBreakdown([
      sale({
        totals: { totalKobo: 100000 },
        counterSale: {
          paymentChannel: 'hmo',
          payments: [
            { channel: 'hmo', amountKobo: 80000 },
            { channel: 'cash', amountKobo: 20000 },
          ],
          returns: [{ refundKobo: 50000 }],
        },
      }),
    ]);
    // 50% refunded → each tender halves.
    expect(channel(rows, 'hmo')?.totalKobo).toBe(40000);
    expect(channel(rows, 'cash')?.totalKobo).toBe(10000);
  });

  it('sorts channels by value, highest first', () => {
    const rows = buildPaymentBreakdown([
      sale({
        counterSale: { paymentChannel: 'cash', payments: [{ channel: 'cash', amountKobo: 5000 }] },
      }),
      sale({
        counterSale: { paymentChannel: 'hmo', payments: [{ channel: 'hmo', amountKobo: 90000 }] },
      }),
    ]);
    expect(rows.map((r) => r.channel)).toEqual(['hmo', 'cash']);
  });
});

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
    const prices = new Map([
      ['a', { priceKobo: 1000, costKobo: 600 }],
      ['b', { priceKobo: 500 }],
    ]);

    const report = buildConsumption(agg, products, prices, from, to);

    expect(report.rows[0].productId).toBe('b'); // 12 units outranks 5
    expect(report.totalUnits).toBe(17);
    expect(report.totalValueKobo).toBe(5 * 1000 + 12 * 500); // 11000
  });

  it('computes cost value and margin only where a cost price exists', () => {
    const agg = [
      { productId: 'a', unitsDispensed: 5, movements: 2 },
      { productId: 'b', unitsDispensed: 12, movements: 4 },
    ];
    const products = new Map([
      ['a', { name: 'A' }],
      ['b', { name: 'B' }],
    ]);
    const prices = new Map([
      ['a', { priceKobo: 1000, costKobo: 600 }],
      ['b', { priceKobo: 500 }], // no cost on file
    ]);

    const report = buildConsumption(agg, products, prices, from, to);
    const rowA = report.rows.find((r) => r.productId === 'a')!;
    const rowB = report.rows.find((r) => r.productId === 'b')!;

    expect(rowA.costKobo).toBe(600);
    expect(rowA.valueAtCostKobo).toBe(3000); // 5 × 600
    expect(rowA.marginKobo).toBe(2000); // 5000 − 3000
    expect(rowB.costKobo).toBeUndefined();
    expect(rowB.valueAtCostKobo).toBeUndefined();
    expect(rowB.marginKobo).toBeUndefined(); // no fake 100% margin
    expect(report.totalValueAtCostKobo).toBe(3000);
    expect(report.totalMarginKobo).toBe(2000);
  });

  it('uses each branch price when combining multi-branch consumption', () => {
    const report = buildConsumption(
      [
        { productId: 'a', branchId: 'b1', unitsDispensed: 2, movements: 1 },
        { productId: 'a', branchId: 'b2', unitsDispensed: 3, movements: 1 },
      ],
      new Map([['a', { name: 'A' }]]),
      new Map([
        ['b1:a', { priceKobo: 1000, costKobo: 600 }],
        ['b2:a', { priceKobo: 2000, costKobo: 1200 }],
      ]),
      from,
      to,
    );

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].unitsDispensed).toBe(5);
    expect(report.rows[0].valueKobo).toBe(8000);
    expect(report.rows[0].valueAtCostKobo).toBe(4800);
    expect(report.rows[0].marginKobo).toBe(3200);
  });

  it('carries the payment-channel breakdown through', () => {
    const report = buildConsumption([], new Map(), new Map(), from, to, [
      { channel: 'cash', totalKobo: 90000, orders: 3 },
      { channel: 'hmo', totalKobo: 50000, orders: 1 },
    ]);
    expect(report.paymentBreakdown).toHaveLength(2);
    expect(report.paymentBreakdown[0].channel).toBe('cash');
  });
});

describe('buildLowStock', () => {
  const products = new Map([
    ['a', { name: 'Amoxicillin' }],
    ['b', { name: 'Vitamin C' }],
  ]);
  const branches = new Map([['b1', 'Lanyard Pharmacy']]);

  it('flags out-of-stock and at-threshold items only', () => {
    const report = buildLowStock(
      [
        { productId: 'a', branchId: 'b1', onHand: 5, reserved: 5, reorderLevel: 2, batches: [] }, // available 0 → out
        { productId: 'b', branchId: 'b1', onHand: 4, reserved: 0, reorderLevel: 4, batches: [] }, // available 4 ≤ 4 → low
        { productId: 'b', branchId: 'b1', onHand: 50, reserved: 0, reorderLevel: 4, batches: [] }, // healthy
      ],
      products,
      branches,
    );

    expect(report.totalItems).toBe(2);
    expect(report.outOfStock).toBe(1);
    expect(report.rows[0]).toMatchObject({
      productName: 'Amoxicillin',
      branchName: 'Lanyard Pharmacy',
      available: 0,
      status: 'out',
    });
    expect(report.rows[1].status).toBe('low');
  });
});

describe('buildExpiring', () => {
  const now = new Date('2026-07-16T00:00:00.000Z');
  const products = new Map([['a', { name: 'Insulin' }]]);
  const branches = new Map([['b1', 'Lanyard Pharmacy']]);
  const day = 24 * 60 * 60 * 1000;

  function item(expiryInDays: number, onHand = 10) {
    return {
      productId: 'a',
      branchId: 'b1',
      onHand,
      reserved: 0,
      reorderLevel: 0,
      batches: [{ expiry: new Date(now.getTime() + expiryInDays * day) }],
    };
  }

  it('bands rows: expired ≤ 0d, red ≤ 180d, yellow ≤ horizon', () => {
    const report = buildExpiring(
      [item(-5), item(30), item(180), item(181), item(269)],
      products,
      branches,
      270,
      now,
    );

    expect(report.rows.map((r) => r.band)).toEqual(['expired', 'red', 'red', 'yellow', 'yellow']);
    expect(report.expired).toBe(1);
    expect(report.red).toBe(2);
    expect(report.yellow).toBe(2);
  });

  it('excludes rows beyond the horizon, without batches, or with no stock', () => {
    const report = buildExpiring(
      [
        item(271),
        item(30, 0),
        { productId: 'a', branchId: 'b1', onHand: 9, reserved: 0, reorderLevel: 0, batches: [] },
      ],
      products,
      branches,
      270,
      now,
    );
    expect(report.rows).toHaveLength(0);
  });

  it('uses the soonest batch expiry per item', () => {
    const report = buildExpiring(
      [
        {
          productId: 'a',
          branchId: 'b1',
          onHand: 4,
          reserved: 0,
          reorderLevel: 0,
          batches: [
            { expiry: new Date(now.getTime() + 250 * day) },
            { expiry: new Date(now.getTime() + 10 * day) },
          ],
        },
      ],
      products,
      branches,
      270,
      now,
    );
    expect(report.rows[0].daysLeft).toBe(10);
    expect(report.rows[0].band).toBe('red');
  });
});
