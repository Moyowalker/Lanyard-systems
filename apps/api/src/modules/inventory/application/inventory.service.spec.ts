import { Types } from 'mongoose';
import { ErrorCode, StockMovementType } from '@lanyard/contracts';

import { InventoryService } from './inventory.service';

function sortedLean<T>(value: T) {
  const lean = jest.fn().mockResolvedValue(value);
  const sort = jest.fn().mockReturnValue({ lean });
  return { sort, lean };
}

function findOneLean<T>(value: T) {
  const lean = jest.fn().mockResolvedValue(value);
  // Support both `.lean()` and `.select(...).lean()` call shapes.
  return { lean, select: jest.fn().mockReturnValue({ lean }) };
}

describe('InventoryService', () => {
  const branchId = new Types.ObjectId().toString();
  const productId = new Types.ObjectId().toString();
  const actorId = new Types.ObjectId().toString();

  let inventoryModel: {
    find: jest.Mock;
    findOne: jest.Mock;
    updateOne: jest.Mock;
    create: jest.Mock;
  };
  let movementModel: { create: jest.Mock };
  let productModel: { find: jest.Mock; findById: jest.Mock; exists: jest.Mock };
  let audit: { record: jest.Mock };
  let service: InventoryService;

  beforeEach(() => {
    inventoryModel = {
      find: jest.fn(),
      findOne: jest.fn(),
      updateOne: jest.fn(),
      create: jest.fn().mockResolvedValue(undefined),
    };
    movementModel = { create: jest.fn().mockResolvedValue(undefined) };
    productModel = {
      find: jest.fn(),
      // Default: product exists with a generic name (receive/adjust load it for audit summaries).
      findById: jest
        .fn()
        .mockReturnValue(findOneLean({ _id: new Types.ObjectId(productId), name: 'Product' })),
      exists: jest.fn().mockResolvedValue(true),
    };

    audit = { record: jest.fn().mockResolvedValue(undefined) };

    service = new InventoryService(
      inventoryModel as never,
      movementModel as never,
      { create: jest.fn(), find: jest.fn() } as never,
      productModel as never,
      { find: jest.fn() } as never,
      { getPriceMap: jest.fn().mockResolvedValue(new Map()), upsertPrice: jest.fn() } as never,
      audit as never,
    );
  });

  it('lists only low-stock rows using available units and reorder thresholds', async () => {
    const productIds = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
    inventoryModel.find.mockReturnValue(
      sortedLean([
        {
          _id: new Types.ObjectId(),
          branchId: new Types.ObjectId(branchId),
          productId: productIds[0],
          onHand: 2,
          reserved: 1,
          reorderLevel: 0,
          batches: [],
        },
        {
          _id: new Types.ObjectId(),
          branchId: new Types.ObjectId(branchId),
          productId: productIds[1],
          onHand: 10,
          reserved: 0,
          reorderLevel: 4,
          batches: [],
        },
        {
          _id: new Types.ObjectId(),
          branchId: new Types.ObjectId(branchId),
          productId: productIds[2],
          onHand: 5,
          reserved: 5,
          reorderLevel: 2,
          batches: [],
        },
      ]),
    );
    productModel.find.mockReturnValue(
      findOneLean([
        { _id: productIds[0], name: 'Amoxicillin' },
        { _id: productIds[1], name: 'Vitamin C' },
        { _id: productIds[2], name: 'Ibuprofen' },
      ]),
    );

    const result = await service.listLowStock(branchId);

    expect(result).toHaveLength(2);
    expect(result.map((row) => row.productName)).toEqual(['Ibuprofen', 'Amoxicillin']);
    expect(result.every((row) => row.isLowStock)).toBe(true);
  });

  it('receives stock into a new inventory row and records a manual movement', async () => {
    const expiry = new Date('2026-08-31T00:00:00.000Z');

    inventoryModel.findOne.mockReturnValueOnce(findOneLean(null)).mockReturnValueOnce(
      findOneLean({
        _id: new Types.ObjectId(),
        branchId: new Types.ObjectId(branchId),
        productId: new Types.ObjectId(productId),
        onHand: 12,
        reserved: 0,
        reorderLevel: 4,
        batches: [{ batchNo: 'LOT-001', expiry, quantity: 12 }],
      }),
    );
    productModel.findById.mockReturnValue(
      findOneLean({ _id: new Types.ObjectId(productId), name: 'Cefuroxime' }),
    );

    const result = await service.receive(branchId, actorId, {
      productId,
      quantity: 12,
      reorderLevel: 4,
      batchNo: 'LOT-001',
      expiry,
      reason: 'Opening stock',
    });

    expect(inventoryModel.create).toHaveBeenCalledWith([
      expect.objectContaining({
        onHand: 12,
        reserved: 0,
        reorderLevel: 4,
        batches: [{ batchNo: 'LOT-001', expiry, quantity: 12 }],
      }),
    ]);
    expect(movementModel.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          type: StockMovementType.RECEIVE,
          quantity: 12,
          refType: 'manual',
          batchNo: 'LOT-001',
          reason: 'Opening stock',
        }),
      ],
      undefined,
    );
    expect(result.productName).toBe('Cefuroxime');
    expect(result.onHand).toBe(12);
    expect(result.isLowStock).toBe(false);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'inventory.receive',
        actorType: 'staff',
        actorId,
        targetType: 'inventory',
        targetId: productId,
        branchId,
        before: { onHand: 0, reserved: 0, reorderLevel: 0, batchCount: 0 },
        after: expect.objectContaining({ onHand: 12, batchCount: 1 }),
      }),
    );
  });

  it('rejects an adjustment that would drop stock below reserved units', async () => {
    inventoryModel.findOne.mockReturnValue(
      findOneLean({
        _id: new Types.ObjectId(),
        branchId: new Types.ObjectId(branchId),
        productId: new Types.ObjectId(productId),
        onHand: 8,
        reserved: 6,
        reorderLevel: 2,
        batches: [],
      }),
    );

    await expect(
      service.adjust(branchId, actorId, {
        productId,
        quantityDelta: -3,
        reason: 'Cycle count correction',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });

    expect(inventoryModel.updateOne).not.toHaveBeenCalled();
    expect(movementModel.create).not.toHaveBeenCalled();
  });

  it('adjusts a tracked batch and records the movement actor and reason', async () => {
    const expiry = new Date('2026-09-30T00:00:00.000Z');
    const snapshot = {
      _id: new Types.ObjectId(),
      branchId: new Types.ObjectId(branchId),
      productId: new Types.ObjectId(productId),
      onHand: 10,
      reserved: 2,
      reorderLevel: 3,
      batches: [{ batchNo: 'LOT-009', expiry, quantity: 5 }],
    };

    inventoryModel.findOne.mockReturnValueOnce(findOneLean(snapshot)).mockReturnValueOnce(
      findOneLean({
        ...snapshot,
        onHand: 8,
        batches: [{ batchNo: 'LOT-009', expiry, quantity: 3 }],
      }),
    );
    inventoryModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
    productModel.findById.mockReturnValue(
      findOneLean({ _id: new Types.ObjectId(productId), name: 'Metformin' }),
    );

    const result = await service.adjust(branchId, actorId, {
      productId,
      quantityDelta: -2,
      batchNo: 'LOT-009',
      expiry,
      reason: 'Cycle count correction',
    });

    expect(inventoryModel.updateOne).toHaveBeenCalledWith(
      { _id: snapshot._id, onHand: 10, reserved: 2 },
      {
        $set: {
          onHand: 8,
          reorderLevel: 3,
          batches: [{ batchNo: 'LOT-009', expiry, quantity: 3 }],
        },
      },
    );
    expect(movementModel.create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          type: StockMovementType.ADJUST,
          quantity: -2,
          refType: 'manual',
          batchNo: 'LOT-009',
          reason: 'Cycle count correction',
        }),
      ],
      undefined,
    );
    expect(result.productName).toBe('Metformin');
    expect(result.onHand).toBe(8);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'inventory.adjust',
        actorType: 'staff',
        actorId,
        targetType: 'inventory',
        targetId: productId,
        branchId,
        before: expect.objectContaining({ onHand: 10, reserved: 2 }),
        after: expect.objectContaining({ onHand: 8 }),
      }),
    );
  });

  it('does not write an audit entry when an adjustment is rejected', async () => {
    inventoryModel.findOne.mockReturnValue(
      findOneLean({
        _id: new Types.ObjectId(),
        branchId: new Types.ObjectId(branchId),
        productId: new Types.ObjectId(productId),
        onHand: 8,
        reserved: 6,
        reorderLevel: 2,
        batches: [],
      }),
    );

    await expect(
      service.adjust(branchId, actorId, {
        productId,
        quantityDelta: -3,
        reason: 'Cycle count correction',
      }),
    ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });

    expect(audit.record).not.toHaveBeenCalled();
  });

  it('still returns a committed adjustment when audit logging fails', async () => {
    const snapshot = {
      _id: new Types.ObjectId(),
      branchId: new Types.ObjectId(branchId),
      productId: new Types.ObjectId(productId),
      onHand: 10,
      reserved: 2,
      reorderLevel: 3,
      batches: [],
    };

    inventoryModel.findOne.mockReturnValueOnce(findOneLean(snapshot)).mockReturnValueOnce(
      findOneLean({
        ...snapshot,
        onHand: 12,
      }),
    );
    inventoryModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
    productModel.findById.mockReturnValue(
      findOneLean({ _id: new Types.ObjectId(productId), name: 'Metformin' }),
    );
    audit.record.mockRejectedValueOnce(new Error('audit unavailable'));

    const result = await service.adjust(branchId, actorId, {
      productId,
      quantityDelta: 2,
      reason: 'Cycle count correction',
    });

    expect(result.onHand).toBe(12);
    expect(movementModel.create).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalled();
  });
});

describe('InventoryService.receiveInvoice', () => {
  const branchId = new Types.ObjectId().toString();
  const actorId = new Types.ObjectId().toString();
  const productA = new Types.ObjectId();
  const productB = new Types.ObjectId();

  function buildService(opts: { priceMap?: Map<string, unknown> } = {}) {
    const invoiceId = new Types.ObjectId();
    const invoiceCreate = jest.fn().mockResolvedValue([
      {
        _id: invoiceId,
        toObject: () => ({
          _id: invoiceId,
          branchId: new Types.ObjectId(branchId),
          vendorName: 'Emzor Distribution',
          invoiceNo: 'INV-0231',
          invoiceDate: new Date('2026-07-01T00:00:00.000Z'),
          receivedByStaffId: new Types.ObjectId(actorId),
          lines: [
            {
              productId: productA,
              productName: 'Paracetamol 500mg',
              quantity: 100,
            },
            { productId: productB, productName: 'Ibuprofen 400mg', quantity: 20 },
          ],
          createdAt: new Date(),
        }),
      },
    ]);
    const movementCreate = jest.fn().mockResolvedValue(undefined);
    const auditRecord = jest.fn().mockResolvedValue(undefined);
    const upsertPrice = jest.fn().mockResolvedValue(undefined);

    const inventoryModel = {
      // Every line hits the "create new row" branch of applyManualMutation.
      findOne: jest.fn().mockReturnValue(findOneLean(null)),
      create: jest.fn().mockResolvedValue(undefined),
      updateOne: jest.fn(),
      find: jest.fn(),
    };
    const productModel = {
      find: jest.fn().mockReturnValue(
        findOneLean([
          { _id: productA, name: 'Paracetamol 500mg' },
          { _id: productB, name: 'Ibuprofen 400mg' },
        ]),
      ),
      findById: jest.fn(),
      exists: jest.fn(),
    };

    const service = new InventoryService(
      inventoryModel as never,
      { create: movementCreate } as never,
      { create: invoiceCreate, find: jest.fn() } as never,
      productModel as never,
      { find: jest.fn() } as never,
      {
        getPriceMap: jest.fn().mockResolvedValue(opts.priceMap ?? new Map()),
        upsertPrice,
      } as never,
      { record: auditRecord } as never,
    );
    return { service, invoiceCreate, movementCreate, auditRecord, upsertPrice, invoiceId };
  }

  const baseInput = {
    vendorName: 'Emzor Distribution',
    invoiceNo: 'INV-0231',
    invoiceDate: new Date('2026-07-01T00:00:00.000Z'),
    lines: [
      { productId: productA.toString(), quantity: 100, priceKobo: 50000, costKobo: 30000 },
      { productId: productB.toString(), quantity: 20 },
    ],
  };

  it('creates the invoice, applies every line with an invoice-linked movement, and audits once', async () => {
    const { service, invoiceCreate, movementCreate, auditRecord, invoiceId } = buildService();

    const result = await service.receiveInvoice(branchId, actorId, baseInput as never);

    expect(invoiceCreate).toHaveBeenCalledTimes(1);
    expect(movementCreate).toHaveBeenCalledTimes(2);
    const movementDoc = movementCreate.mock.calls[0][0][0];
    expect(movementDoc.refType).toBe('invoice');
    expect(movementDoc.refId.toString()).toBe(invoiceId.toString());
    expect(movementDoc.reason).toContain('INV-0231');

    // ONE invoice-level audit entry with a human summary — not one per line.
    expect(auditRecord).toHaveBeenCalledTimes(1);
    const entry = auditRecord.mock.calls[0][0];
    expect(entry.action).toBe('inventory.receive_invoice');
    expect(entry.summary).toContain('INV-0231');
    expect(entry.summary).toContain('Emzor Distribution');
    expect(entry.summary).toContain('120 units');
    expect(entry.metadata.vendorName).toBe('Emzor Distribution');
    expect(entry.metadata.invoiceDate).toBe('2026-07-01');
    expect(entry.metadata.lines[0].product).toBe('Paracetamol 500mg');

    expect(result.vendorName).toBe('Emzor Distribution');
    expect(result.totalUnits).toBe(120);
  });

  it('upserts price + storefront visibility for lines that set them', async () => {
    const { service, upsertPrice } = buildService();

    await service.receiveInvoice(branchId, actorId, {
      ...baseInput,
      lines: [
        {
          productId: productA.toString(),
          quantity: 100,
          priceKobo: 50000,
          costKobo: 30000,
          visibleOnStorefront: false,
        },
        { productId: productB.toString(), quantity: 20 },
      ],
    } as never);

    expect(upsertPrice).toHaveBeenCalledTimes(1);
    expect(upsertPrice).toHaveBeenCalledWith(branchId, {
      productId: productA.toString(),
      priceKobo: 50000,
      costKobo: 30000,
      compareAtKobo: undefined,
      isAvailable: false,
    });
  });

  it('rejects a line marked visible with no price (new or existing) before any mutation', async () => {
    const { service, invoiceCreate, movementCreate } = buildService();

    await expect(
      service.receiveInvoice(branchId, actorId, {
        ...baseInput,
        lines: [{ productId: productB.toString(), quantity: 20, visibleOnStorefront: true }],
      } as never),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });

    expect(invoiceCreate).not.toHaveBeenCalled();
    expect(movementCreate).not.toHaveBeenCalled();
  });

  it('rejects unknown products before any mutation', async () => {
    const { service, invoiceCreate } = buildService();

    await expect(
      service.receiveInvoice(branchId, actorId, {
        ...baseInput,
        lines: [{ productId: new Types.ObjectId().toString(), quantity: 5 }],
      } as never),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
    expect(invoiceCreate).not.toHaveBeenCalled();
  });
});
