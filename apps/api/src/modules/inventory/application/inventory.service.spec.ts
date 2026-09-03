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

const transaction = {
  run: jest.fn(async (work: (session: object) => Promise<unknown>) => work({ transaction: true })),
};

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
      transaction as never,
      { putObject: jest.fn(), getSignedDownloadUrl: jest.fn(), signedUrlTtl: 300 } as never,
      { findOne: jest.fn() } as never,
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

  it('filters inventory rows by a search term across name, brand, and generic fields', async () => {
    const productIds = [new Types.ObjectId(), new Types.ObjectId()];
    productModel.find.mockImplementation((filter) => {
      if (filter && '$or' in filter) {
        return findOneLean([
          { _id: productIds[0], name: 'Paracetamol', genericName: 'Acetaminophen', brand: 'Emzor' },
          { _id: productIds[1], name: 'Vitamin C', genericName: 'Ascorbic acid', brand: 'MediCare' },
        ]);
      }
      if (filter && '_id' in filter) {
        return findOneLean([
          { _id: productIds[0], name: 'Paracetamol', genericName: 'Acetaminophen', brand: 'Emzor' },
        ]);
      }
      return sortedLean([]);
    });
    inventoryModel.find.mockImplementation((filter) => {
      if (filter && 'productId' in filter && filter.productId && '$in' in filter.productId) {
        return sortedLean([
          {
            _id: new Types.ObjectId(),
            branchId: new Types.ObjectId(branchId),
            productId: productIds[0],
            onHand: 5,
            reserved: 0,
            reorderLevel: 2,
            batches: [],
          },
        ]);
      }
      return sortedLean([]);
    });

    const result = await service.listBranchInventory(branchId, 'emzor');

    expect(result).toHaveLength(1);
    expect(result[0].productName).toBe('Paracetamol');
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
      transaction as never,
      { putObject: jest.fn(), getSignedDownloadUrl: jest.fn(), signedUrlTtl: 300 } as never,
      { findOne: jest.fn() } as never,
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
    expect(upsertPrice).toHaveBeenCalledWith(
      branchId,
      {
        productId: productA.toString(),
        priceKobo: 50000,
        costKobo: 30000,
        compareAtKobo: undefined,
        isAvailable: false,
      },
      expect.anything(),
    );
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

  it('returns a recoverable conflict when the first inventory receipt write conflicts', async () => {
    const { service } = buildService();
    const inventory = (service as unknown as { inventoryModel: { create: jest.Mock } }).inventoryModel;
    inventory.create.mockRejectedValueOnce({ code: 112, message: 'WriteConflict' });

    await expect(service.receiveInvoice(branchId, actorId, baseInput as never)).rejects.toMatchObject({
      code: ErrorCode.CONFLICT,
    });
  });
});

describe('InventoryService invoice lifecycle (drafts, publish, payment)', () => {
  const branchId = new Types.ObjectId().toString();
  const actorId = new Types.ObjectId().toString();
  const productA = new Types.ObjectId();

  function makeService(
    overrides: {
      findOne?: unknown;
      priceMap?: Map<string, unknown>;
      inventoryRow?: unknown;
    } = {},
  ) {
    const invoiceId = new Types.ObjectId();
    const invoiceCreate = jest.fn().mockResolvedValue([
      {
        _id: invoiceId,
        toObject: () => ({
          _id: invoiceId,
          branchId: new Types.ObjectId(branchId),
          vendorName: 'Emzor',
          invoiceNo: 'INV-9',
          invoiceDate: new Date('2026-07-01T00:00:00.000Z'),
          receivedByStaffId: new Types.ObjectId(actorId),
          status: 'draft',
          paymentStatus: 'paid',
          lines: [{ productId: productA, productName: 'Paracetamol', quantity: 100 }],
          createdAt: new Date(),
        }),
      },
    ]);
    const invoiceDeleteOne = jest.fn().mockResolvedValue({ deletedCount: 1 });
    const movementCreate = jest.fn().mockResolvedValue(undefined);
    const auditRecord = jest.fn().mockResolvedValue(undefined);
    const upsertPrice = jest.fn().mockResolvedValue(undefined);

    const inventoryModel = {
      findOne: jest.fn().mockReturnValue(findOneLean(overrides.inventoryRow ?? null)),
      create: jest.fn().mockResolvedValue(undefined),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
      find: jest.fn(),
    };
    const productModel = {
      find: jest.fn().mockReturnValue(findOneLean([{ _id: productA, name: 'Paracetamol' }])),
      findById: jest.fn(),
    };
    const invoiceModel = {
      create: invoiceCreate,
      find: jest.fn(),
      findOne: jest.fn().mockResolvedValue(overrides.findOne ?? null),
      deleteOne: invoiceDeleteOne,
    };

    const service = new InventoryService(
      inventoryModel as never,
      { create: movementCreate } as never,
      invoiceModel as never,
      productModel as never,
      { find: jest.fn() } as never,
      {
        getPriceMap: jest.fn().mockResolvedValue(overrides.priceMap ?? new Map()),
        upsertPrice,
      } as never,
      { record: auditRecord } as never,
      transaction as never,
      { putObject: jest.fn(), getSignedDownloadUrl: jest.fn(), signedUrlTtl: 300 } as never,
      { findOne: jest.fn() } as never,
    );
    return {
      service,
      invoiceCreate,
      invoiceDeleteOne,
      movementCreate,
      auditRecord,
      invoiceId,
    };
  }

  const draftInput = {
    vendorName: 'Emzor',
    invoiceNo: 'INV-9',
    invoiceDate: new Date('2026-07-01T00:00:00.000Z'),
    paymentStatus: 'paid',
    asDraft: true,
    lines: [{ productId: productA.toString(), quantity: 100, visibleOnStorefront: false }],
  };

  it('draft create applies no stock movements and audits as a draft', async () => {
    const { service, invoiceCreate, movementCreate, auditRecord } = makeService();

    await service.receiveInvoice(branchId, actorId, draftInput as never);

    expect(invoiceCreate).toHaveBeenCalledTimes(1);
    expect(movementCreate).not.toHaveBeenCalled();
    expect(auditRecord.mock.calls[0][0].action).toBe('inventory.invoice_draft');
  });

  it('publish applies stock exactly once and audits the receive', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const draftDoc = {
      _id: new Types.ObjectId(),
      status: 'draft',
      vendorName: 'Emzor',
      invoiceNo: 'INV-9',
      invoiceDate: new Date('2026-07-01T00:00:00.000Z'),
      paymentStatus: 'paid',
      lines: [{ productId: productA, quantity: 100, priceKobo: 50000, visibleOnStorefront: false }],
      save,
      toObject: () => ({
        _id: new Types.ObjectId(),
        branchId: new Types.ObjectId(branchId),
        vendorName: 'Emzor',
        invoiceNo: 'INV-9',
        invoiceDate: new Date('2026-07-01T00:00:00.000Z'),
        receivedByStaffId: new Types.ObjectId(actorId),
        status: 'received',
        paymentStatus: 'paid',
        lines: [{ productId: productA, productName: 'Paracetamol', quantity: 100 }],
        createdAt: new Date(),
      }),
    };
    const { service, movementCreate, auditRecord } = makeService({ findOne: draftDoc });

    await service.publishInvoice(branchId, actorId, draftDoc._id.toString());

    expect(movementCreate).toHaveBeenCalledTimes(1);
    expect(draftDoc.status).toBe('received');
    expect(save).toHaveBeenCalled();
    expect(auditRecord.mock.calls.at(-1)?.[0].action).toBe('inventory.receive_invoice');
  });

  it('rejects updating a received invoice', async () => {
    const { service } = makeService({ findOne: { status: 'received' } });
    await expect(
      service.updateInvoice(
        branchId,
        actorId,
        new Types.ObjectId().toString(),
        draftInput as never,
      ),
    ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
  });

  it('rejects deleting a received invoice', async () => {
    const { service, invoiceDeleteOne } = makeService({ findOne: { status: 'received' } });
    await expect(
      service.deleteInvoice(branchId, actorId, new Types.ObjectId().toString()),
    ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
    expect(invoiceDeleteOne).not.toHaveBeenCalled();
  });

  it('voids a received invoice once by recording compensating stock movement', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const invoiceId = new Types.ObjectId();
    const received = {
      _id: invoiceId,
      branchId: new Types.ObjectId(branchId),
      status: 'received' as const,
      vendorName: 'Emzor',
      invoiceNo: 'INV-9',
      invoiceDate: new Date('2026-07-01T00:00:00.000Z'),
      paymentStatus: 'paid' as const,
      receivedByStaffId: new Types.ObjectId(actorId),
      lines: [{ productId: productA, productName: 'Paracetamol', quantity: 100 }],
      save,
      toObject() {
        return this;
      },
    };
    const { service, movementCreate, auditRecord } = makeService({
      findOne: received,
      inventoryRow: {
        _id: new Types.ObjectId(),
        branchId: new Types.ObjectId(branchId),
        productId: productA,
        onHand: 100,
        reserved: 0,
        reorderLevel: 0,
        batches: [],
      },
    });

    await service.voidInvoice(branchId, actorId, invoiceId.toString());

    expect(received.status).toBe('voided');
    expect(save).toHaveBeenCalled();
    const movement = movementCreate.mock.calls[0][0][0];
    expect(movement).toMatchObject({ type: StockMovementType.ADJUST, quantity: -100, refType: 'invoice' });
    expect(movement.refId.toString()).toBe(invoiceId.toString());
    expect(auditRecord.mock.calls.at(-1)?.[0].action).toBe('inventory.invoice_voided');
  });

  it('rejects voiding an invoice that was already voided', async () => {
    const { service, movementCreate } = makeService({ findOne: { status: 'voided' } });

    await expect(
      service.voidInvoice(branchId, actorId, new Types.ObjectId().toString()),
    ).rejects.toMatchObject({ code: ErrorCode.CONFLICT });
    expect(movementCreate).not.toHaveBeenCalled();
  });

  it('marks an invoice paid and audits it', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const doc = {
      _id: new Types.ObjectId(),
      branchId: new Types.ObjectId(branchId),
      status: 'received',
      vendorName: 'Emzor',
      invoiceNo: 'INV-9',
      paymentStatus: 'unpaid',
      paymentDueDate: new Date(),
      invoiceDate: new Date('2026-07-01T00:00:00.000Z'),
      receivedByStaffId: new Types.ObjectId(actorId),
      lines: [{ productId: productA, productName: 'Paracetamol', quantity: 100 }],
      save,
      toObject() {
        return this;
      },
    };
    const { service, auditRecord } = makeService({ findOne: doc });

    await service.updateInvoicePayment(branchId, actorId, doc._id.toString(), {
      paymentStatus: 'paid',
    });

    expect(doc.paymentStatus).toBe('paid');
    expect(save).toHaveBeenCalled();
    const entry = auditRecord.mock.calls.at(-1)?.[0];
    expect(entry.action).toBe('inventory.invoice_paid');
    expect(entry.summary).toContain('marked paid');
  });
});

describe('InventoryService invoice attachments', () => {
  const branchId = new Types.ObjectId().toString();
  const actorId = new Types.ObjectId().toString();

  function baseArgs(invoiceModel: unknown, storage: unknown) {
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const transaction = {
      run: jest.fn(async (work: (session: object) => Promise<unknown>) => work({})),
    };
    return {
      audit,
      service: new InventoryService(
        { findOne: jest.fn() } as never,
        { create: jest.fn() } as never,
        invoiceModel as never,
        { find: jest.fn() } as never,
        { find: jest.fn() } as never,
        { getPriceMap: jest.fn(), upsertPrice: jest.fn() } as never,
        audit as never,
        transaction as never,
        storage as never,
        { findOne: jest.fn() } as never,
      ),
    };
  }

  it('uploads the scan, stores the key, and audits it', async () => {
    const invoiceId = new Types.ObjectId();
    const save = jest.fn().mockResolvedValue(undefined);
    const doc: Record<string, unknown> = {
      _id: invoiceId,
      branchId: new Types.ObjectId(branchId),
      vendorName: 'Emzor',
      invoiceNo: 'INV-1',
      invoiceDate: new Date('2026-07-01T00:00:00.000Z'),
      receivedByStaffId: new Types.ObjectId(actorId),
      status: 'received',
      paymentStatus: 'paid',
      lines: [],
      save,
      toObject() {
        return this;
      },
    };
    const invoiceModel = { findOne: jest.fn().mockResolvedValue(doc) };
    const putObject = jest.fn().mockResolvedValue(undefined);
    const storage = {
      putObject,
      deleteObject: jest.fn().mockResolvedValue(undefined),
      getSignedDownloadUrl: jest.fn(),
      signedUrlTtl: 300,
    };
    const { service, audit } = baseArgs(invoiceModel, storage);

    const result = await service.attachInvoiceScan(branchId, actorId, invoiceId.toString(), {
      buffer: Buffer.from('pdf'),
      mime: 'application/pdf',
      ext: 'pdf',
    });

    expect(putObject).toHaveBeenCalledTimes(1);
    expect(doc.attachmentKey).toContain(`invoices/${branchId}/${invoiceId.toString()}/`);
    expect(save).toHaveBeenCalled();
    expect(result.hasAttachment).toBe(true);
    expect(audit.record.mock.calls.at(-1)?.[0].action).toBe('inventory.invoice_attachment');
  });

  it('removes the previous object after replacing a scan', async () => {
    const invoiceId = new Types.ObjectId();
    const doc: Record<string, unknown> = {
      _id: invoiceId,
      branchId: new Types.ObjectId(branchId),
      vendorName: 'Emzor',
      invoiceNo: 'INV-1',
      invoiceDate: new Date('2026-07-01T00:00:00.000Z'),
      receivedByStaffId: new Types.ObjectId(actorId),
      status: 'received',
      paymentStatus: 'paid',
      lines: [],
      attachmentKey: 'invoices/old.pdf',
      save: jest.fn().mockResolvedValue(undefined),
      toObject() {
        return this;
      },
    };
    const deleteObject = jest.fn().mockResolvedValue(undefined);
    const { service } = baseArgs(
      { findOne: jest.fn().mockResolvedValue(doc) },
      { putObject: jest.fn(), deleteObject, signedUrlTtl: 300 },
    );

    await service.attachInvoiceScan(branchId, actorId, invoiceId.toString(), {
      buffer: Buffer.from('pdf'),
      mime: 'application/pdf',
      ext: 'pdf',
    });

    expect(deleteObject).toHaveBeenCalledWith('invoices/old.pdf');
  });

  it('removes a newly uploaded object when saving its key fails', async () => {
    const invoiceId = new Types.ObjectId();
    const doc: Record<string, unknown> = {
      _id: invoiceId,
      vendorName: 'Emzor',
      invoiceNo: 'INV-1',
      status: 'received',
      paymentStatus: 'paid',
      lines: [],
      save: jest.fn().mockRejectedValue(new Error('database unavailable')),
    };
    const deleteObject = jest.fn().mockResolvedValue(undefined);
    const { service } = baseArgs(
      { findOne: jest.fn().mockResolvedValue(doc) },
      { putObject: jest.fn(), deleteObject, signedUrlTtl: 300 },
    );

    await expect(
      service.attachInvoiceScan(branchId, actorId, invoiceId.toString(), {
        buffer: Buffer.from('pdf'),
        mime: 'application/pdf',
        ext: 'pdf',
      }),
    ).rejects.toThrow('database unavailable');

    expect(deleteObject).toHaveBeenCalledWith(expect.stringContaining(`/invoices/`.slice(1)));
  });

  it('returns a signed URL for the attachment', async () => {
    const invoiceModel = {
      findOne: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ attachmentKey: 'invoices/x/y/z.pdf' }),
      }),
    };
    const storage = {
      putObject: jest.fn(),
      deleteObject: jest.fn(),
      getSignedDownloadUrl: jest.fn().mockResolvedValue('https://signed.example/z.pdf'),
      signedUrlTtl: 300,
    };
    const { service } = baseArgs(invoiceModel, storage);

    const result = await service.getInvoiceAttachmentUrl(branchId, new Types.ObjectId().toString());

    expect(result.url).toBe('https://signed.example/z.pdf');
    expect(result.expiresInSeconds).toBe(300);
  });
});
