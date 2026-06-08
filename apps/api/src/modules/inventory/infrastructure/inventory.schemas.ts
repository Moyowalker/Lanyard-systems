import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { StockMovementType } from '@lanyard/contracts';
import { baseSchemaOptions, immutableGuard } from '../../../database/schema.helpers';

/* ════════════════════════════════════════════════════════════════════════
 * inventory_items — PER-BRANCH stock. available = onHand - reserved.
 * Reservations prevent overselling across concurrent orders (see doc 03 §5).
 * ════════════════════════════════════════════════════════════════════════ */

export type InventoryItemDocument = HydratedDocument<InventoryItem>;

@Schema({ _id: false })
export class StockBatch {
  @Prop({ required: true, trim: true }) batchNo: string;
  @Prop({ type: Date, required: true }) expiry: Date;
  @Prop({ type: Number, required: true, min: 0 }) quantity: number;
}
export const StockBatchSchema = SchemaFactory.createForClass(StockBatch);

@Schema({ ...baseSchemaOptions, collection: 'inventory_items' })
export class InventoryItem {
  @Prop({ type: Types.ObjectId, ref: 'Branch', required: true, index: true })
  branchId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', required: true, index: true })
  productId: Types.ObjectId;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  onHand: number;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  reserved: number;

  @Prop({ type: Number, default: 0, min: 0 })
  reorderLevel: number;

  /** Batch/expiry tracking (NAFDAC-relevant for medicines). */
  @Prop({ type: [StockBatchSchema], default: [] })
  batches: StockBatch[];
}

export const InventoryItemSchema = SchemaFactory.createForClass(InventoryItem);
InventoryItemSchema.index({ branchId: 1, productId: 1 }, { unique: true });
InventoryItemSchema.index({ branchId: 1, 'batches.expiry': 1 });
InventoryItemSchema.index({ branchId: 1, onHand: 1 }); // low-stock scans
// `available` exposed as a virtual for read convenience.
InventoryItemSchema.virtual('available').get(function (this: InventoryItemDocument) {
  return Math.max(0, (this.onHand ?? 0) - (this.reserved ?? 0));
});

/* ════════════════════════════════════════════════════════════════════════
 * stock_movements — APPEND-ONLY ledger of every stock change. Auditable,
 * supports reconciliation. quantity is signed (+receive / -dispense).
 * ════════════════════════════════════════════════════════════════════════ */

export type StockMovementDocument = HydratedDocument<StockMovement>;

@Schema({ ...baseSchemaOptions, collection: 'stock_movements' })
export class StockMovement {
  @Prop({ type: Types.ObjectId, ref: 'Branch', required: true, index: true })
  branchId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', required: true, index: true })
  productId: Types.ObjectId;

  @Prop({ type: String, enum: StockMovementType, required: true })
  type: StockMovementType;

  /** Signed delta applied to onHand (or reserved, by type). */
  @Prop({ type: Number, required: true })
  quantity: number;

  @Prop({ type: String, enum: ['order', 'manual', 'system'], default: 'system' })
  refType?: string;

  @Prop({ type: Types.ObjectId, index: true })
  refId?: Types.ObjectId; // e.g. order id

  @Prop({ type: String, trim: true })
  batchNo?: string;

  @Prop({ type: Types.ObjectId, ref: 'StaffUser' })
  actorId?: Types.ObjectId;

  @Prop({ type: String, trim: true })
  reason?: string;
}

export const StockMovementSchema = SchemaFactory.createForClass(StockMovement);
StockMovementSchema.index({ branchId: 1, productId: 1, createdAt: -1 });
// `refId` index is declared inline on the @Prop above.
immutableGuard(StockMovementSchema); // append-only
