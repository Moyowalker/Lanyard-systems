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

  @Prop({ type: String, enum: ['order', 'manual', 'system', 'invoice'], default: 'system' })
  refType?: string;

  @Prop({ type: Types.ObjectId, index: true })
  refId?: Types.ObjectId; // e.g. order id, or stock invoice id when refType is 'invoice'

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

/* ════════════════════════════════════════════════════════════════════════
 * stock_invoices — Goods-received notes. One document per supplier invoice:
 * vendor, invoice number, supply date, and the received lines. This is the
 * record the pharmacy audits receiving against; movements reference it via
 * refType 'invoice'. Append-only.
 * ════════════════════════════════════════════════════════════════════════ */

export type StockInvoiceDocument = HydratedDocument<StockInvoice>;

@Schema({ _id: false })
export class StockInvoiceLine {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId: Types.ObjectId;

  /** Name snapshot at receiving time — keeps the record readable if renamed. */
  @Prop({ required: true, trim: true })
  productName: string;

  @Prop({ type: Number, required: true, min: 1 })
  quantity: number;

  @Prop({ type: String, trim: true }) batchNo?: string;
  @Prop({ type: Date }) expiry?: Date;
  @Prop({ type: Number, min: 0 }) costKobo?: number;
  @Prop({ type: Number, min: 0 }) priceKobo?: number;
  @Prop({ type: Number, min: 0 }) reorderLevel?: number;
  @Prop({ type: Boolean }) visibleOnStorefront?: boolean;
}
export const StockInvoiceLineSchema = SchemaFactory.createForClass(StockInvoiceLine);

@Schema({ ...baseSchemaOptions, collection: 'stock_invoices' })
export class StockInvoice {
  @Prop({ type: Types.ObjectId, ref: 'Branch', required: true, index: true })
  branchId: Types.ObjectId;

  /** Optional link to the vendor registry; `vendorName` is the readable snapshot. */
  @Prop({ type: Types.ObjectId, ref: 'Vendor', index: true })
  vendorId?: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 160 })
  vendorName: string;

  @Prop({ required: true, trim: true, maxlength: 80 })
  invoiceNo: string;

  /** The date the vendor supplied the goods (from the paper invoice). */
  @Prop({ type: Date, required: true })
  invoiceDate: Date;

  @Prop({ type: String, trim: true, maxlength: 500 })
  note?: string;

  @Prop({ type: Types.ObjectId, ref: 'StaffUser', required: true })
  receivedByStaffId: Types.ObjectId;

  /**
  * `draft` = editable, no stock/price applied yet; `received` = published, stock
  * movements + price/visibility upserts done; `voided` = received stock safely
  * reversed while retaining the original invoice and ledger history.
   */
  @Prop({ type: String, enum: ['draft', 'received', 'voided'], default: 'received', index: true })
  status: 'draft' | 'received' | 'voided';

  @Prop({ type: String, enum: ['paid', 'unpaid'], default: 'unpaid' })
  paymentStatus: 'paid' | 'unpaid';

  /** Expected payment date — required (in the DTO) while unpaid. */
  @Prop({ type: Date })
  paymentDueDate?: Date;

  @Prop({ type: String, trim: true })
  idempotencyKey?: string;

  /** Object-store key of the uploaded scanned invoice (audit artefact), if any. */
  @Prop({ type: String, trim: true })
  attachmentKey?: string;

  @Prop({ type: [StockInvoiceLineSchema], required: true })
  lines: StockInvoiceLine[];
}

export const StockInvoiceSchema = SchemaFactory.createForClass(StockInvoice);
StockInvoiceSchema.index({ branchId: 1, createdAt: -1 });
StockInvoiceSchema.index({ branchId: 1, invoiceNo: 1 });
StockInvoiceSchema.index({ branchId: 1, idempotencyKey: 1 }, { unique: true, sparse: true });
StockInvoiceSchema.index({ branchId: 1, status: 1, createdAt: -1 });
// NOTE: no immutableGuard here. Invoices are NOT append-only: drafts are editable
// and deletable, and received invoices accept payment-status updates. The service
// enforces which transitions are allowed (received docs accept payment fields only).
