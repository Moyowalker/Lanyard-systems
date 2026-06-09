import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  AdjustInventoryInput,
  BranchInventoryItemDto,
  ErrorCode,
  ReceiveInventoryInput,
  StockMovementType,
} from '@lanyard/contracts';

import { InventoryItem, StockMovement } from '../infrastructure/inventory.schemas';
import { Product } from '../../catalog/infrastructure/catalog.schemas';
import { DomainError } from '../../../core/errors/domain-error';

type InventorySnapshot = {
  _id: Types.ObjectId;
  branchId: Types.ObjectId;
  productId: Types.ObjectId;
  onHand?: number;
  reserved?: number;
  reorderLevel?: number;
  batches?: Array<{ batchNo: string; expiry: Date; quantity: number }>;
};

type ProductSnapshot = {
  _id: Types.ObjectId;
  name?: string;
  genericName?: string;
  brand?: string;
  form?: string;
  strength?: string;
};

type ManualInventoryMutation = {
  productId: string;
  quantityDelta: number;
  reorderLevel?: number;
  batchNo?: string;
  expiry?: Date;
  reason: string;
  movementType: StockMovementType.RECEIVE | StockMovementType.ADJUST;
};

type MovementOptions = {
  orderId?: string;
  actorId?: string;
  reason?: string;
  batchNo?: string;
  refType?: 'order' | 'manual' | 'system';
};

/** Read-side inventory helpers + reservation logic (the order/payment phase). */
@Injectable()
export class InventoryService {
  constructor(
    @InjectModel(InventoryItem.name) private readonly inventoryModel: Model<InventoryItem>,
    @InjectModel(StockMovement.name) private readonly movementModel: Model<StockMovement>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
  ) {}

  async listBranchInventory(branchId: string): Promise<BranchInventoryItemDto[]> {
    const rows = await this.inventoryModel
      .find({ branchId: new Types.ObjectId(branchId) })
      .sort({ onHand: 1, reserved: -1 })
      .lean<InventorySnapshot[]>();

    return this.hydrateInventoryRows(rows);
  }

  async listLowStock(branchId: string): Promise<BranchInventoryItemDto[]> {
    const rows = await this.listBranchInventory(branchId);
    return rows
      .filter((row) => row.isLowStock)
      .sort((left, right) => left.available - right.available || left.productName.localeCompare(right.productName));
  }

  async receive(
    branchId: string,
    actorId: string,
    input: ReceiveInventoryInput,
  ): Promise<BranchInventoryItemDto> {
    await this.assertProductExists(input.productId);
    await this.applyManualMutation(branchId, actorId, {
      productId: input.productId,
      quantityDelta: input.quantity,
      reorderLevel: input.reorderLevel,
      batchNo: input.batchNo,
      expiry: input.expiry,
      reason: input.reason ?? 'Stock received',
      movementType: StockMovementType.RECEIVE,
    });
    return this.getBranchInventoryItem(branchId, input.productId);
  }

  async adjust(
    branchId: string,
    actorId: string,
    input: AdjustInventoryInput,
  ): Promise<BranchInventoryItemDto> {
    await this.assertProductExists(input.productId);
    await this.applyManualMutation(branchId, actorId, {
      productId: input.productId,
      quantityDelta: input.quantityDelta,
      reorderLevel: input.reorderLevel,
      batchNo: input.batchNo,
      expiry: input.expiry,
      reason: input.reason,
      movementType: StockMovementType.ADJUST,
    });
    return this.getBranchInventoryItem(branchId, input.productId);
  }

  /** Available units (onHand − reserved, floored at 0) per product at a branch. */
  async getAvailabilityMap(branchId: string, productIds: string[]): Promise<Map<string, number>> {
    if (productIds.length === 0) return new Map();
    const rows = await this.inventoryModel
      .find({
        branchId: new Types.ObjectId(branchId),
        productId: { $in: productIds.map((id) => new Types.ObjectId(id)) },
      })
      .lean();
    const map = new Map<string, number>();
    for (const r of rows) {
      map.set(r.productId.toString(), Math.max(0, (r.onHand ?? 0) - (r.reserved ?? 0)));
    }
    return map;
  }

  /**
   * Atomically reserve `qty` if available (onHand − reserved ≥ qty). The availability
   * check and increment happen in ONE update (via $expr in the filter), so concurrent
   * reservations cannot oversell (doc 10 R11). Returns false if insufficient stock.
   */
  async reserve(
    branchId: string,
    productId: string,
    qty: number,
    session?: ClientSession,
    orderId?: string,
  ): Promise<boolean> {
    const res = await this.inventoryModel.updateOne(
      {
        branchId: new Types.ObjectId(branchId),
        productId: new Types.ObjectId(productId),
        $expr: { $gte: [{ $subtract: ['$onHand', '$reserved'] }, qty] },
      },
      { $inc: { reserved: qty } },
      { session },
    );
    if (res.modifiedCount !== 1) return false;
    await this.movement(StockMovementType.RESERVE, branchId, productId, qty, { orderId }, session);
    return true;
  }

  /**
   * Dispense `qty`: convert a reservation into an actual stock decrement (the goods leave
   * the branch). Decrements both `reserved` and `onHand`. Throws if the reservation is
   * missing — completion must not silently dispense unbacked stock.
   */
  async dispense(
    branchId: string,
    productId: string,
    qty: number,
    session?: ClientSession,
    orderId?: string,
  ): Promise<void> {
    const res = await this.inventoryModel.updateOne(
      {
        branchId: new Types.ObjectId(branchId),
        productId: new Types.ObjectId(productId),
        $expr: { $gte: ['$reserved', qty] },
      },
      { $inc: { reserved: -qty, onHand: -qty } },
      { session },
    );
    if (res.modifiedCount !== 1) {
      throw new DomainError(ErrorCode.CONFLICT, 'Cannot dispense: stock reservation missing');
    }
    await this.movement(StockMovementType.DISPENSE, branchId, productId, -qty, { orderId }, session);
  }

  /** Release a previously held reservation (e.g. cancellation/refund/expiry). */
  async release(
    branchId: string,
    productId: string,
    qty: number,
    session?: ClientSession,
    orderId?: string,
  ): Promise<void> {
    await this.inventoryModel.updateOne(
      {
        branchId: new Types.ObjectId(branchId),
        productId: new Types.ObjectId(productId),
        $expr: { $gte: ['$reserved', qty] },
      },
      { $inc: { reserved: -qty } },
      { session },
    );
    await this.movement(StockMovementType.RELEASE, branchId, productId, -qty, { orderId }, session);
  }

  private async getBranchInventoryItem(
    branchId: string,
    productId: string,
  ): Promise<BranchInventoryItemDto> {
    const row = await this.inventoryModel
      .findOne({ branchId: new Types.ObjectId(branchId), productId: new Types.ObjectId(productId) })
      .lean<InventorySnapshot | null>();
    if (!row) throw new DomainError(ErrorCode.NOT_FOUND, 'Inventory item not found');

    const product = await this.productModel.findById(productId).lean<ProductSnapshot | null>();
    return this.toInventoryDto(row, product ?? undefined);
  }

  private async hydrateInventoryRows(rows: InventorySnapshot[]): Promise<BranchInventoryItemDto[]> {
    if (rows.length === 0) return [];

    const productIds = rows.map((row) => row.productId.toString());
    const products = await this.productModel
      .find({ _id: { $in: productIds.map((id) => new Types.ObjectId(id)) } })
      .lean<ProductSnapshot[]>();
    const productById = new Map(products.map((product) => [product._id.toString(), product]));

    return rows.map((row) => this.toInventoryDto(row, productById.get(row.productId.toString())));
  }

  private toInventoryDto(
    row: InventorySnapshot,
    product?: ProductSnapshot,
  ): BranchInventoryItemDto {
    const nextExpiry = [...(row.batches ?? [])]
      .filter((batch) => batch.expiry)
      .sort((left, right) => left.expiry.getTime() - right.expiry.getTime())[0]?.expiry;
    const available = Math.max(0, (row.onHand ?? 0) - (row.reserved ?? 0));
    const reorderLevel = row.reorderLevel ?? 0;

    return {
      productId: row.productId.toString(),
      productName: product?.name ?? 'Unknown product',
      genericName: product?.genericName,
      brand: product?.brand,
      form: product?.form,
      strength: product?.strength,
      onHand: row.onHand ?? 0,
      reserved: row.reserved ?? 0,
      available,
      reorderLevel,
      batchCount: row.batches?.length ?? 0,
      nextExpiry: nextExpiry?.toISOString(),
      isLowStock: available <= this.lowStockThreshold(reorderLevel),
    };
  }

  private async applyManualMutation(
    branchId: string,
    actorId: string,
    input: ManualInventoryMutation,
  ): Promise<void> {
    const branchObjectId = new Types.ObjectId(branchId);
    const productObjectId = new Types.ObjectId(input.productId);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const current = await this.inventoryModel
        .findOne({ branchId: branchObjectId, productId: productObjectId })
        .lean<InventorySnapshot | null>();

      if (!current) {
        if (input.quantityDelta < 0) {
          throw new DomainError(ErrorCode.NOT_FOUND, 'Inventory item not found');
        }

        const batches = this.applyBatchDelta([], input.quantityDelta, input.batchNo, input.expiry);

        try {
          await this.inventoryModel.create([
            {
              branchId: branchObjectId,
              productId: productObjectId,
              onHand: input.quantityDelta,
              reserved: 0,
              reorderLevel: input.reorderLevel ?? 0,
              batches,
            },
          ]);
        } catch (err) {
          if (this.isDuplicateKey(err)) continue;
          throw err;
        }

        await this.movement(
          input.movementType,
          branchId,
          input.productId,
          input.quantityDelta,
          {
            actorId,
            reason: input.reason,
            batchNo: input.batchNo,
            refType: 'manual',
          },
        );
        return;
      }

      const currentOnHand = current.onHand ?? 0;
      const currentReserved = current.reserved ?? 0;
      const nextOnHand = currentOnHand + input.quantityDelta;

      if (nextOnHand < 0 || nextOnHand < currentReserved) {
        throw new DomainError(
          ErrorCode.CONFLICT,
          'Adjustment would reduce stock below reserved units',
        );
      }

      const nextBatches = this.applyBatchDelta(
        current.batches ?? [],
        input.quantityDelta,
        input.batchNo,
        input.expiry,
      );

      const update = await this.inventoryModel.updateOne(
        { _id: current._id, onHand: currentOnHand, reserved: currentReserved },
        {
          $set: {
            onHand: nextOnHand,
            reorderLevel: input.reorderLevel ?? current.reorderLevel ?? 0,
            batches: nextBatches,
          },
        },
      );

      if (update.modifiedCount !== 1) continue;

      await this.movement(
        input.movementType,
        branchId,
        input.productId,
        input.quantityDelta,
        {
          actorId,
          reason: input.reason,
          batchNo: input.batchNo,
          refType: 'manual',
        },
      );
      return;
    }

    throw new DomainError(
      ErrorCode.CONFLICT,
      'Inventory changed during update, retry the operation',
    );
  }

  private applyBatchDelta(
    currentBatches: Array<{ batchNo: string; expiry: Date; quantity: number }>,
    quantityDelta: number,
    batchNo?: string,
    expiry?: Date,
  ): Array<{ batchNo: string; expiry: Date; quantity: number }> {
    const batches = currentBatches.map((batch) => ({
      batchNo: batch.batchNo,
      expiry: new Date(batch.expiry),
      quantity: batch.quantity,
    }));

    if (!batchNo || !expiry) {
      if (batches.length > 0) {
        throw new DomainError(
          ErrorCode.VALIDATION_FAILED,
          'Batch number and expiry are required for tracked stock',
          [
            { field: 'batchNo', issue: 'required for tracked stock' },
            { field: 'expiry', issue: 'required for tracked stock' },
          ],
        );
      }
      return batches;
    }

    const batchExpiry = new Date(expiry);
    const index = batches.findIndex(
      (batch) => batch.batchNo === batchNo && batch.expiry.getTime() === batchExpiry.getTime(),
    );

    if (index === -1) {
      if (quantityDelta < 0) {
        throw new DomainError(
          ErrorCode.VALIDATION_FAILED,
          'Batch not found for stock adjustment',
          [{ field: 'batchNo', issue: 'unknown batch' }],
        );
      }

      batches.push({ batchNo, expiry: batchExpiry, quantity: quantityDelta });
      return this.sortBatches(batches);
    }

    const nextQuantity = batches[index].quantity + quantityDelta;
    if (nextQuantity < 0) {
      throw new DomainError(ErrorCode.CONFLICT, 'Batch adjustment would make stock negative');
    }

    if (nextQuantity === 0) {
      batches.splice(index, 1);
      return this.sortBatches(batches);
    }

    batches[index] = { ...batches[index], quantity: nextQuantity };
    return this.sortBatches(batches);
  }

  private sortBatches(batches: Array<{ batchNo: string; expiry: Date; quantity: number }>) {
    return [...batches].sort(
      (left, right) => left.expiry.getTime() - right.expiry.getTime() || left.batchNo.localeCompare(right.batchNo),
    );
  }

  private lowStockThreshold(reorderLevel: number): number {
    return Math.max(1, reorderLevel);
  }

  private async assertProductExists(productId: string): Promise<void> {
    const exists = await this.productModel.exists({ _id: new Types.ObjectId(productId) });
    if (!exists) throw new DomainError(ErrorCode.NOT_FOUND, 'Product not found');
  }

  private isDuplicateKey(err: unknown): boolean {
    return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
  }

  private async movement(
    type: StockMovementType,
    branchId: string,
    productId: string,
    quantity: number,
    options: MovementOptions = {},
    session?: ClientSession,
  ): Promise<void> {
    const doc = {
      branchId: new Types.ObjectId(branchId),
      productId: new Types.ObjectId(productId),
      type,
      quantity,
      refType: options.refType ?? (options.orderId ? 'order' : 'system'),
      refId: options.orderId ? new Types.ObjectId(options.orderId) : undefined,
      batchNo: options.batchNo,
      actorId: options.actorId ? new Types.ObjectId(options.actorId) : undefined,
      reason: options.reason,
    };
    await this.movementModel.create(session ? [doc] : [doc], session ? { session } : undefined);
  }
}
