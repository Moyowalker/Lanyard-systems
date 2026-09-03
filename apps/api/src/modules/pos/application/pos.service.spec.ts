import { Types } from 'mongoose';
import {
  ErrorCode,
  OrderStatus,
  PaymentChannel,
  ProductStatus,
  RegulatoryClass,
} from '@lanyard/contracts';

import { PosService } from './pos.service';
import { DomainError } from '../../../core/errors/domain-error';
import { AuthPrincipal } from '../../../core/auth/principal';

// ── fixtures ─────────────────────────────────────────────────────────────────

const BRANCH_ID = new Types.ObjectId().toString();
const STAFF_ID = new Types.ObjectId().toString();

const principal: AuthPrincipal = {
  sub: STAFF_ID,
  realm: 'staff',
  roles: ['CASHIER'],
  permissions: ['pos:sell', 'catalog:read', 'order:read'],
  branchScope: [BRANCH_ID],
  sessionId: 's1',
} as AuthPrincipal;

function makeProduct(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: new Types.ObjectId(),
    name: 'Paracetamol 500mg',
    form: 'tablet',
    strength: '500mg',
    status: ProductStatus.PUBLISHED,
    regulatoryClass: RegulatoryClass.OTC,
    requiresPrescription: false,
    ...overrides,
  };
}

function saleInput(productId: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    branchId: BRANCH_ID,
    items: [{ productId, quantity: 2 }],
    // 2 × 80000 kobo — must equal the post-discount total exactly.
    payments: [{ channel: PaymentChannel.CASH, amountKobo: 160000 }],
    idempotencyKey: '3f9a4a9c-1111-4222-8333-444455556666',
    ...overrides,
  } as never;
}

type Mocks = {
  orderFindOne: jest.Mock;
  orderCreate: jest.Mock;
  orderFindById: jest.Mock;
  orderFind: jest.Mock;
  recordOfflinePayment: jest.Mock;
  completeInSession: jest.Mock;
  findOrCreateByPhone: jest.Mock;
  findOrCreateWalkIn: jest.Mock;
  auditRecord: jest.Mock;
};

function buildService(opts: {
  products?: unknown[];
  priceMap?: Map<string, { priceKobo: number; isAvailable: boolean; currency: string }>;
  availability?: Map<string, number>;
  paidStatus?: OrderStatus;
  existingByIdempotency?: unknown;
  salesRows?: unknown[];
}): { service: PosService; mocks: Mocks } {
  const createdOrder = {
    _id: new Types.ObjectId(),
    orderNo: 'LNY-TEST01',
    branchId: new Types.ObjectId(BRANCH_ID),
    customerId: new Types.ObjectId(),
    status: opts.paidStatus ?? OrderStatus.PAID,
    items: [],
    totals: { subtotalKobo: 0, totalKobo: 0, currency: 'NGN' },
    payment: { paidAt: new Date() },
    counterSale: {
      cashierStaffId: new Types.ObjectId(STAFF_ID),
      paymentChannel: PaymentChannel.CASH,
      idempotencyKey: 'k',
    },
    createdAt: new Date(),
  };

  const mocks: Mocks = {
    orderFindOne: jest.fn().mockResolvedValue(opts.existingByIdempotency ?? null),
    orderCreate: jest.fn().mockResolvedValue([createdOrder]),
    orderFindById: jest.fn().mockImplementation(() => ({
      session: jest.fn().mockResolvedValue(createdOrder),
      then: (resolve: (v: unknown) => void) => resolve(createdOrder),
    })),
    orderFind: jest.fn(),
    recordOfflinePayment: jest.fn().mockResolvedValue({ intentId: 'i1' }),
    completeInSession: jest.fn().mockResolvedValue(createdOrder),
    findOrCreateByPhone: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
    findOrCreateWalkIn: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
    auditRecord: jest.fn().mockResolvedValue(undefined),
  };

  const orderFind = jest.fn().mockReturnValue({
    sort: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue(opts.salesRows ?? []) }),
  });
  const orderModel = {
    findOne: mocks.orderFindOne,
    create: mocks.orderCreate,
    findById: mocks.orderFindById,
    find: orderFind,
  };
  const productModel = {
    find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(opts.products) }),
  };
  const leanChain = {
    select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }),
  };
  const listLeanChain = {
    select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
  };
  const staffModel = {
    findById: jest.fn().mockReturnValue(leanChain),
    find: jest.fn().mockReturnValue(listLeanChain),
  };
  const customerModel = {
    findById: jest.fn().mockReturnValue(leanChain),
    find: jest.fn().mockReturnValue(listLeanChain),
  };
  mocks.orderFind = orderFind;

  const service = new PosService(
    orderModel as never,
    {} as never,
    productModel as never,
    staffModel as never,
    customerModel as never,
    { listProductsForPos: jest.fn().mockResolvedValue({ data: [], meta: {} }) } as never,
    { genOrderNo: () => 'LNY-TEST01', completeInSession: mocks.completeInSession } as never,
    { recordOfflinePayment: mocks.recordOfflinePayment } as never,
    { recordOfflineRefund: jest.fn().mockResolvedValue({ refundId: 'r1' }) } as never,
    { getAvailabilityMap: jest.fn().mockResolvedValue(opts.availability ?? new Map()) } as never,
    { getPriceMap: jest.fn().mockResolvedValue(opts.priceMap ?? new Map()) } as never,
    {
      findOrCreateByPhone: mocks.findOrCreateByPhone,
      findOrCreateWalkIn: mocks.findOrCreateWalkIn,
    } as never,
    { record: mocks.auditRecord } as never,
    {
      run: jest.fn().mockImplementation(async (fn: (s: unknown) => Promise<unknown>) => fn(null)),
    } as never,
  );

  return { service, mocks };
}

function pricedAndStocked(product: { _id: Types.ObjectId }) {
  const id = product._id.toString();
  return {
    priceMap: new Map([[id, { priceKobo: 80000, isAvailable: true, currency: 'NGN' }]]),
    availability: new Map([[id, 10]]),
  };
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('PosService.createSale', () => {
  it('completes a cash sale: order created, offline payment recorded, stock dispensed', async () => {
    const product = makeProduct();
    const { service, mocks } = buildService({ products: [product], ...pricedAndStocked(product) });

    const sale = await service.createSale(principal, saleInput(product._id.toString()));

    expect(mocks.orderCreate).toHaveBeenCalled();
    const orderDoc = mocks.orderCreate.mock.calls[0][0][0];
    expect(orderDoc.status).toBe(OrderStatus.AWAITING_PAYMENT);
    expect(orderDoc.fulfillment.type).toBe('counter');
    expect(orderDoc.totals.totalKobo).toBe(160000); // server-side price × qty 2
    expect(mocks.recordOfflinePayment).toHaveBeenCalledWith(
      expect.any(String),
      PaymentChannel.CASH,
      STAFF_ID,
      null,
    );
    expect(mocks.completeInSession).toHaveBeenCalled();
    expect(mocks.findOrCreateWalkIn).toHaveBeenCalled(); // no customer captured
    expect(sale.orderNo).toBe('LNY-TEST01');
  });

  it('links the sale to a customer when a phone is captured', async () => {
    const product = makeProduct();
    const { service, mocks } = buildService({ products: [product], ...pricedAndStocked(product) });

    await service.createSale(
      principal,
      saleInput(product._id.toString(), {
        customer: { phone: '+2348012345678', firstName: 'Ada' },
      }),
    );

    expect(mocks.findOrCreateByPhone).toHaveBeenCalledWith('+2348012345678', expect.anything());
    expect(mocks.findOrCreateWalkIn).not.toHaveBeenCalled();
  });

  it('blocks CONTROLLED substances at the counter', async () => {
    const product = makeProduct({ regulatoryClass: RegulatoryClass.CONTROLLED });
    const { service } = buildService({ products: [product], ...pricedAndStocked(product) });

    await expect(
      service.createSale(principal, saleInput(product._id.toString())),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
  });

  it('requires an rxNote for prescription-only (POM) items', async () => {
    const product = makeProduct({ regulatoryClass: RegulatoryClass.POM });
    const { service } = buildService({ products: [product], ...pricedAndStocked(product) });

    await expect(
      service.createSale(principal, saleInput(product._id.toString())),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
  });

  it('accepts POM items once the prescription-sighted note is provided', async () => {
    const product = makeProduct({ regulatoryClass: RegulatoryClass.POM });
    const { service, mocks } = buildService({ products: [product], ...pricedAndStocked(product) });

    await service.createSale(
      principal,
      saleInput(product._id.toString(), { rxNote: 'Rx sighted — Dr Bello, LUTH, ref 4411' }),
    );

    expect(mocks.orderCreate).toHaveBeenCalled();
    expect(mocks.orderCreate.mock.calls[0][0][0].counterSale.rxNote).toContain('Dr Bello');
  });

  it('fails fast with a per-line error when stock is short', async () => {
    const product = makeProduct();
    const id = product._id.toString();
    const { service, mocks } = buildService({
      products: [product],
      priceMap: new Map([[id, { priceKobo: 80000, isAvailable: true, currency: 'NGN' }]]),
      availability: new Map([[id, 1]]), // asks for 2
    });

    await expect(service.createSale(principal, saleInput(id))).rejects.toMatchObject({
      code: ErrorCode.CONFLICT,
    });
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it('rejects items without an active branch price', async () => {
    const product = makeProduct();
    const { service } = buildService({
      products: [product],
      priceMap: new Map(),
      availability: new Map([[product._id.toString(), 10]]),
    });

    await expect(
      service.createSale(principal, saleInput(product._id.toString())),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
  });

  it('aborts (rolls back) when payment lands the order anywhere but PAID', async () => {
    const product = makeProduct();
    const { service, mocks } = buildService({
      products: [product],
      ...pricedAndStocked(product),
      paidStatus: OrderStatus.STOCK_HOLD, // ledger/shelf disagreement race
    });

    await expect(
      service.createSale(principal, saleInput(product._id.toString())),
    ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
    expect(mocks.completeInSession).not.toHaveBeenCalled();
  });

  it('returns the existing sale for a duplicate idempotency key without re-charging', async () => {
    const product = makeProduct();
    const existing = {
      _id: new Types.ObjectId(),
      orderNo: 'LNY-FIRST',
      branchId: new Types.ObjectId(BRANCH_ID),
      customerId: new Types.ObjectId(),
      items: [],
      totals: { subtotalKobo: 0, totalKobo: 0, currency: 'NGN' },
      payment: { paidAt: new Date() },
      counterSale: {
        cashierStaffId: new Types.ObjectId(STAFF_ID),
        paymentChannel: PaymentChannel.CASH,
        idempotencyKey: 'k',
      },
      createdAt: new Date(),
    };
    const { service, mocks } = buildService({
      products: [product],
      ...pricedAndStocked(product),
      existingByIdempotency: existing,
    });

    const sale = await service.createSale(principal, saleInput(product._id.toString()));

    expect(sale.orderNo).toBe('LNY-FIRST');
    expect(mocks.orderCreate).not.toHaveBeenCalled();
    expect(mocks.recordOfflinePayment).not.toHaveBeenCalled();
  });
});

describe('PosService.listSales (authorization)', () => {
  function managerPrincipal(overrides: Partial<AuthPrincipal> = {}): AuthPrincipal {
    return {
      sub: STAFF_ID,
      realm: 'staff',
      roles: ['BRANCH_MANAGER'],
      permissions: ['pos:sell', 'order:read', 'order:transition'],
      branchScope: [BRANCH_ID],
      sessionId: 's1',
      ...overrides,
    } as AuthPrincipal;
  }

  function filterFor(mocks: Mocks): Record<string, unknown> {
    return mocks.orderFind.mock.calls[0][0] as Record<string, unknown>;
  }

  it('always filters to counter fulfilment and a single day window', async () => {
    const { service, mocks } = buildService({});
    await service.listSales(managerPrincipal(), { limit: 50 } as never);
    const filter = filterFor(mocks);
    expect(filter['fulfillment.type']).toBe('counter');
    expect(filter.createdAt).toEqual(
      expect.objectContaining({ $gte: expect.any(Date), $lt: expect.any(Date) }),
    );
  });

  it('restricts a cashier (no order:transition) to their own sales', async () => {
    const { service, mocks } = buildService({});
    // `principal` is a CASHIER with pos:sell/catalog:read/order:read (no order:transition).
    await service.listSales(principal, { limit: 50 } as never);
    expect(filterFor(mocks)['counterSale.cashierStaffId']).toBeDefined();
  });

  it('does not self-restrict a manager by default', async () => {
    const { service, mocks } = buildService({});
    await service.listSales(managerPrincipal(), { limit: 50 } as never);
    expect(filterFor(mocks)['counterSale.cashierStaffId']).toBeUndefined();
  });

  it('honours an explicit mine=true for a manager, but not mine=false', async () => {
    const yes = buildService({});
    await yes.service.listSales(managerPrincipal(), { mine: 'true', limit: 50 } as never);
    expect(filterFor(yes.mocks)['counterSale.cashierStaffId']).toBeDefined();

    const no = buildService({});
    await no.service.listSales(managerPrincipal(), { mine: 'false', limit: 50 } as never);
    expect(filterFor(no.mocks)['counterSale.cashierStaffId']).toBeUndefined();
  });

  it('rejects a branch outside the caller scope', async () => {
    const { service } = buildService({});
    await expect(
      service.listSales(managerPrincipal(), {
        branchId: new Types.ObjectId().toString(),
        limit: 50,
      } as never),
    ).rejects.toMatchObject({ code: ErrorCode.BRANCH_SCOPE_VIOLATION });
  });
});

describe('PosService.createSale — discounts & split payments', () => {
  it('applies a percentage discount server-side and validates the payment sum', async () => {
    const product = makeProduct();
    const { service, mocks } = buildService({ products: [product], ...pricedAndStocked(product) });

    // subtotal 160000, 10% off → total 144000
    await service.createSale(
      principal,
      saleInput(product._id.toString(), {
        discount: { type: 'percent', value: 10 },
        payments: [{ channel: PaymentChannel.CASH, amountKobo: 144000 }],
      }),
    );

    const orderDoc = mocks.orderCreate.mock.calls[0][0][0];
    expect(orderDoc.totals.discountKobo).toBe(16000);
    expect(orderDoc.totals.totalKobo).toBe(144000);
  });

  it('caps a fixed discount at the subtotal', async () => {
    const product = makeProduct();
    const { service, mocks } = buildService({ products: [product], ...pricedAndStocked(product) });

    await service.createSale(
      principal,
      saleInput(product._id.toString(), {
        discount: { type: 'fixed', value: 999999999 },
        payments: [{ channel: PaymentChannel.CASH, amountKobo: 0 }],
      }),
    );
    // discount clamps to the 160000 subtotal → total 0... payments must sum to 0.
    // amountKobo 0 fails zod positive() in the real pipe, but service-level math is the target here.
    const orderDoc = mocks.orderCreate.mock.calls[0][0][0];
    expect(orderDoc.totals.discountKobo).toBe(160000);
    expect(orderDoc.totals.totalKobo).toBe(0);
  });

  it('rejects payments that do not sum to the post-discount total', async () => {
    const product = makeProduct();
    const { service, mocks } = buildService({ products: [product], ...pricedAndStocked(product) });

    await expect(
      service.createSale(
        principal,
        saleInput(product._id.toString(), {
          payments: [
            { channel: PaymentChannel.CASH, amountKobo: 100000 },
            { channel: PaymentChannel.HMO, amountKobo: 50000 }, // 10000 short
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
    expect(mocks.orderCreate).not.toHaveBeenCalled();
  });

  it('records a split cash + HMO payment on the counter sale', async () => {
    const product = makeProduct();
    const { service, mocks } = buildService({ products: [product], ...pricedAndStocked(product) });

    await service.createSale(
      principal,
      saleInput(product._id.toString(), {
        payments: [
          { channel: PaymentChannel.CASH, amountKobo: 100000 },
          { channel: PaymentChannel.HMO, amountKobo: 60000 },
        ],
      }),
    );

    const orderDoc = mocks.orderCreate.mock.calls[0][0][0];
    expect(orderDoc.counterSale.paymentChannel).toBe(PaymentChannel.CASH); // primary = first
    expect(orderDoc.counterSale.payments).toEqual([
      { channel: PaymentChannel.CASH, amountKobo: 100000 },
      { channel: PaymentChannel.HMO, amountKobo: 60000 },
    ]);
    // One offline intent for the full amount under the primary channel.
    expect(mocks.recordOfflinePayment).toHaveBeenCalledWith(
      expect.any(String),
      PaymentChannel.CASH,
      STAFF_ID,
      null,
    );
  });
});

describe('PosService.returnSale', () => {
  const ORDER_ID = new Types.ObjectId();
  const PRODUCT_ID = new Types.ObjectId();

  function completedSale(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      _id: ORDER_ID,
      orderNo: 'LNY-RET01',
      branchId: new Types.ObjectId(BRANCH_ID),
      customerId: new Types.ObjectId(),
      status: OrderStatus.COMPLETED,
      fulfillment: { type: 'counter' },
      items: [
        {
          productId: PRODUCT_ID,
          name: 'Paracetamol 500mg',
          unitPriceKobo: 80000,
          quantity: 2,
          lineTotalKobo: 160000,
          requiresPrescription: false,
        },
      ],
      totals: { subtotalKobo: 160000, discountKobo: 16000, totalKobo: 144000, currency: 'NGN' },
      payment: { paidAt: new Date() },
      counterSale: {
        cashierStaffId: new Types.ObjectId(STAFF_ID),
        paymentChannel: PaymentChannel.CASH,
        idempotencyKey: 'k',
        returns: [],
      },
      createdAt: new Date(),
      ...overrides,
    };
  }

  function buildReturnService(order: unknown) {
    const recordOfflineRefund = jest.fn().mockResolvedValue({ refundId: 'r1' });
    const returnStock = jest.fn().mockResolvedValue(undefined);
    const releaseAndTransition = jest.fn().mockResolvedValue(undefined);
    const updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
    const auditRecord = jest.fn().mockResolvedValue(undefined);

    const service = new PosService(
      { findById: jest.fn().mockResolvedValue(order), updateOne } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { releaseAndTransition } as never,
      {} as never,
      { recordOfflineRefund } as never,
      { returnStock } as never,
      {} as never,
      {} as never,
      { record: auditRecord } as never,
      {
        run: jest.fn().mockImplementation(async (fn: (s: unknown) => Promise<unknown>) => fn(null)),
      } as never,
    );
    return { service, recordOfflineRefund, returnStock, releaseAndTransition, updateOne };
  }

  const manager: AuthPrincipal = {
    sub: STAFF_ID,
    realm: 'staff',
    roles: ['BRANCH_MANAGER'],
    permissions: ['pos:sell', 'pos:refund'],
    branchScope: [BRANCH_ID],
    sessionId: 's1',
  } as AuthPrincipal;

  it('returns one unit with a discount-proportional refund and restocks it', async () => {
    const { service, recordOfflineRefund, returnStock, releaseAndTransition } =
      buildReturnService(completedSale());

    const result = await service.returnSale(manager, ORDER_ID.toString(), {
      items: [{ productId: PRODUCT_ID.toString(), quantity: 1 }],
      reason: 'Wrong strength dispensed',
    });

    // 80000 × (1 − 16000/160000) = 72000
    expect(result.refundKobo).toBe(72000);
    expect(result.orderStatus).toBe(OrderStatus.COMPLETED); // partial → stays completed
    expect(recordOfflineRefund).toHaveBeenCalledWith(
      ORDER_ID.toString(),
      72000,
      'Wrong strength dispensed',
      STAFF_ID,
      null,
    );
    expect(returnStock).toHaveBeenCalledWith(
      BRANCH_ID,
      PRODUCT_ID.toString(),
      1,
      STAFF_ID,
      ORDER_ID.toString(),
      'Wrong strength dispensed',
      null,
    );
    expect(releaseAndTransition).not.toHaveBeenCalled();
  });

  it('moves the order to REFUNDED on a full return and clamps the final refund', async () => {
    const { service, recordOfflineRefund, releaseAndTransition } =
      buildReturnService(completedSale());

    const result = await service.returnSale(manager, ORDER_ID.toString(), {
      reason: 'Customer returned everything',
    });

    // Full return: refund = whole paid total (clamped, rounding-safe).
    expect(result.refundKobo).toBe(144000);
    expect(result.orderStatus).toBe(OrderStatus.REFUNDED);
    expect(recordOfflineRefund).toHaveBeenCalledWith(
      ORDER_ID.toString(),
      144000,
      'Customer returned everything',
      STAFF_ID,
      null,
    );
    expect(releaseAndTransition).toHaveBeenCalled();
  });

  it('rejects returning more than was sold (cumulative)', async () => {
    const { service } = buildReturnService(
      completedSale({
        counterSale: {
          cashierStaffId: new Types.ObjectId(STAFF_ID),
          paymentChannel: PaymentChannel.CASH,
          idempotencyKey: 'k',
          returns: [
            {
              byStaffId: new Types.ObjectId(STAFF_ID),
              reason: 'first return',
              items: [{ productId: PRODUCT_ID, quantity: 2 }],
              refundKobo: 144000,
              at: new Date(),
            },
          ],
        },
      }),
    );

    await expect(
      service.returnSale(manager, ORDER_ID.toString(), {
        items: [{ productId: PRODUCT_ID.toString(), quantity: 1 }],
        reason: 'over-return attempt',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
  });

  it('rejects returns on non-completed sales', async () => {
    const { service } = buildReturnService(completedSale({ status: OrderStatus.PAID }));

    await expect(
      service.returnSale(manager, ORDER_ID.toString(), { reason: 'too early' }),
    ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
  });
});
