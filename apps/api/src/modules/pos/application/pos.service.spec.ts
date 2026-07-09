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
    payment: { channel: PaymentChannel.CASH },
    idempotencyKey: '3f9a4a9c-1111-4222-8333-444455556666',
    ...overrides,
  } as never;
}

type Mocks = {
  orderFindOne: jest.Mock;
  orderCreate: jest.Mock;
  orderFindById: jest.Mock;
  recordOfflinePayment: jest.Mock;
  completeInSession: jest.Mock;
  findOrCreateByPhone: jest.Mock;
  findOrCreateWalkIn: jest.Mock;
  auditRecord: jest.Mock;
};

function buildService(opts: {
  products: unknown[];
  priceMap?: Map<string, { priceKobo: number; isAvailable: boolean; currency: string }>;
  availability?: Map<string, number>;
  paidStatus?: OrderStatus;
  existingByIdempotency?: unknown;
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
    recordOfflinePayment: jest.fn().mockResolvedValue({ intentId: 'i1' }),
    completeInSession: jest.fn().mockResolvedValue(createdOrder),
    findOrCreateByPhone: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
    findOrCreateWalkIn: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
    auditRecord: jest.fn().mockResolvedValue(undefined),
  };

  const orderModel = {
    findOne: mocks.orderFindOne,
    create: mocks.orderCreate,
    findById: mocks.orderFindById,
    find: jest.fn(),
  };
  const productModel = {
    find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(opts.products) }),
  };
  const leanChain = { select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) }) };
  const staffModel = { findById: jest.fn().mockReturnValue(leanChain) };
  const customerModel = { findById: jest.fn().mockReturnValue(leanChain) };

  const service = new PosService(
    orderModel as never,
    productModel as never,
    staffModel as never,
    customerModel as never,
    { genOrderNo: () => 'LNY-TEST01', completeInSession: mocks.completeInSession } as never,
    { recordOfflinePayment: mocks.recordOfflinePayment } as never,
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
