import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { ErrorCode, StockMovementType } from '@lanyard/contracts';

import { InventoryItem, StockMovement } from '../infrastructure/inventory.schemas';
import { Product } from '../../catalog/infrastructure/catalog.schemas';
import { DomainError } from '../../../core/errors/domain-error';

export type BranchInventoryListItem = {
  productId: string;
  productName: string;
  genericName?: string;
  brand?: string;
  form?: string;
  strength?: string;
  onHand: number;
  reserved: number;
  available: number;
  reorderLevel: number;
  batchCount: number;
  nextExpiry?: string;
};

/** Read-side inventory helpers + reservation logic (the order/payment phase). */
@Injectable()
export class InventoryService {
  constructor(
    @InjectModel(InventoryItem.name) private readonly inventoryModel: Model<InventoryItem>,
    @InjectModel(StockMovement.name) private readonly movementModel: Model<StockMovement>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
  ) {}

  async listBranchInventory(branchId: string): Promise<BranchInventoryListItem[]> {
    const rows = await this.inventoryModel
      .find({ branchId: new Types.ObjectId(branchId) })
      .sort({ onHand: 1, reserved: -1 })
      .lean();
    if (rows.length === 0) return [];

    const productIds = rows.map((row) => row.productId.toString());
    const products = await this.productModel
      .find({ _id: { $in: productIds.map((id) => new Types.ObjectId(id)) } })
      .lean();
    const productById = new Map(products.map((product) => [product._id.toString(), product]));

    return rows.map((row) => {
      const product = productById.get(row.productId.toString());
      const nextExpiry = [...(row.batches ?? [])]
        .filter((batch) => batch.expiry)
        .sort((left, right) => left.expiry.getTime() - right.expiry.getTime())[0]?.expiry;

      return {
        productId: row.productId.toString(),
        productName: (product?.name as string | undefined) ?? 'Unknown product',
        genericName: product?.genericName as string | undefined,
        brand: product?.brand as string | undefined,
        form: product?.form as string | undefined,
        strength: product?.strength as string | undefined,
        onHand: row.onHand ?? 0,
        reserved: row.reserved ?? 0,
        available: Math.max(0, (row.onHand ?? 0) - (row.reserved ?? 0)),
        reorderLevel: row.reorderLevel ?? 0,
        batchCount: row.batches?.length ?? 0,
        nextExpiry: nextExpiry?.toISOString(),
      };
    });
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
    await this.movement(StockMovementType.RESERVE, branchId, productId, qty, orderId, session);
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
    await this.movement(StockMovementType.DISPENSE, branchId, productId, -qty, orderId, session);
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
    await this.movement(StockMovementType.RELEASE, branchId, productId, -qty, orderId, session);
  }

  private async movement(
    type: StockMovementType,
    branchId: string,
    productId: string,
    quantity: number,
    orderId?: string,
    session?: ClientSession,
  ): Promise<void> {
    const doc = {
      branchId: new Types.ObjectId(branchId),
      productId: new Types.ObjectId(productId),
      type,
      quantity,
      refType: orderId ? 'order' : 'system',
      refId: orderId ? new Types.ObjectId(orderId) : undefined,
    };
    await this.movementModel.create(session ? [doc] : [doc], session ? { session } : undefined);
  }
}
