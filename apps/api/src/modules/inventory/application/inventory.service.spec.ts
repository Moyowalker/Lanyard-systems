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
  return { lean };
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
      findById: jest.fn(),
      exists: jest.fn().mockResolvedValue(true),
    };

    audit = { record: jest.fn().mockResolvedValue(undefined) };

    service = new InventoryService(
      inventoryModel as never,
      movementModel as never,
      productModel as never,
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
});
