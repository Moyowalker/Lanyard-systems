import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';
import {
  ActorType,
  AdjustInventoryInput,
  BranchInventoryItemDto,
  ErrorCode,
  InventoryExportQuery,
  Paginated,
  ReceiveInventoryInput,
  ReceiveInvoiceInput,
  SignedFileUrlDto,
  StockInvoiceDto,
  StockInvoiceQuery,
  StockMovementDto,
  StockMovementQuery,
  StockMovementType,
} from '@lanyard/contracts';

import { InventoryItem, StockInvoice, StockMovement } from '../infrastructure/inventory.schemas';
import { Product } from '../../catalog/infrastructure/catalog.schemas';
import { StaffUser } from '../../identity/infrastructure/identity.schemas';
import { PriceEntry, PricingService } from '../../pricing/application/pricing.service';
import { Vendor } from '../../vendor/infrastructure/vendor.schema';
import { DomainError } from '../../../core/errors/domain-error';
import { AuditService } from '../../../core/platform/audit.service';
import { StorageService } from '../../../core/storage/storage.service';
import { TransactionService } from '../../../core/platform/transaction.service';
import { cursorFilterDesc, paginate } from '../../../core/pagination/cursor';

/** A validated scanned-invoice file from the multipart upload. */
export interface UploadedInvoiceScan {
  buffer: Buffer;
  mime: string;
  ext: string;
}

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
  /** Product name for human-readable audit summaries. */
  productName?: string;
  quantityDelta: number;
  reorderLevel?: number;
  batchNo?: string;
  expiry?: Date;
  reason: string;
  movementType: StockMovementType.RECEIVE | StockMovementType.ADJUST;
  /** Link the movement to a stock invoice (GRN) instead of a bare manual entry. */
  invoiceId?: string;
  /** Invoice receiving writes ONE invoice-level audit entry instead of per-line ones. */
  suppressAudit?: boolean;
};

type MovementOptions = {
  orderId?: string;
  invoiceId?: string;
  actorId?: string;
  reason?: string;
  batchNo?: string;
  refType?: 'order' | 'manual' | 'system' | 'invoice';
};

/** Read-side inventory helpers + reservation logic (the order/payment phase). */
@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @InjectModel(InventoryItem.name) private readonly inventoryModel: Model<InventoryItem>,
    @InjectModel(StockMovement.name) private readonly movementModel: Model<StockMovement>,
    @InjectModel(StockInvoice.name) private readonly invoiceModel: Model<StockInvoice>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    @InjectModel(StaffUser.name) private readonly staffModel: Model<StaffUser>,
    private readonly pricing: PricingService,
    private readonly audit: AuditService,
    private readonly tx: TransactionService,
    private readonly storage: StorageService,
    @InjectModel(Vendor.name) private readonly vendorModel: Model<Vendor>,
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
      .sort(
        (left, right) =>
          left.available - right.available || left.productName.localeCompare(right.productName),
      );
  }

  /** Items whose soonest batch expires within `withinDays`, soonest first. */
  async listExpiring(branchId: string, withinDays: number): Promise<BranchInventoryItemDto[]> {
    const cutoff = Date.now() + withinDays * 24 * 60 * 60 * 1000;
    const rows = await this.listBranchInventory(branchId);
    return rows
      .filter((row) => row.nextExpiry && new Date(row.nextExpiry).getTime() <= cutoff)
      .sort(
        (left, right) =>
          new Date(left.nextExpiry!).getTime() - new Date(right.nextExpiry!).getTime(),
      );
  }

  /**
   * Read the append-only stock-movement ledger for a branch, newest first, cursor
   * paginated. Optional filters: product, movement type, and a createdAt date range.
   */
  async listMovements(
    branchId: string,
    query: StockMovementQuery,
  ): Promise<Paginated<StockMovementDto>> {
    const filter: Record<string, unknown> = {
      branchId: new Types.ObjectId(branchId),
      ...cursorFilterDesc(query.cursor),
    };
    if (query.productId) filter.productId = new Types.ObjectId(query.productId);
    if (query.type) filter.type = query.type;
    if (query.from || query.to) {
      const createdAt: Record<string, Date> = {};
      if (query.from) createdAt.$gte = query.from;
      if (query.to) createdAt.$lte = query.to;
      filter.createdAt = createdAt;
    }

    const rows = await this.movementModel
      .find(filter)
      .sort({ _id: -1 })
      .limit(query.limit + 1)
      .lean();

    const productById = new Map(
      (
        await this.productModel
          .find({ _id: { $in: rows.map((r) => r.productId) } })
          .lean<ProductSnapshot[]>()
      ).map((p) => [p._id.toString(), p]),
    );

    const mapped: StockMovementDto[] = rows.map((row) => ({
      id: row._id.toString(),
      productId: row.productId.toString(),
      productName: productById.get(row.productId.toString())?.name ?? 'Unknown product',
      type: row.type,
      quantity: row.quantity,
      refType: row.refType as StockMovementDto['refType'],
      refId: row.refId?.toString(),
      batchNo: row.batchNo,
      actorId: row.actorId?.toString(),
      reason: row.reason,
      at: (row as { createdAt?: Date }).createdAt?.toISOString() ?? new Date().toISOString(),
    }));

    return paginate(mapped, query.limit);
  }

  /** Build a spreadsheet/CSV of branch stock, one row per batch (and per batchless item). */
  async exportBranchInventory(
    branchId: string,
    format: InventoryExportQuery['format'],
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const rows = await this.inventoryModel
      .find({ branchId: new Types.ObjectId(branchId) })
      .sort({ onHand: 1 })
      .lean<InventorySnapshot[]>();
    const productById = new Map(
      (
        await this.productModel
          .find({ _id: { $in: rows.map((r) => r.productId) } })
          .lean<ProductSnapshot[]>()
      ).map((p) => [p._id.toString(), p]),
    );

    const records: Record<string, string | number>[] = [];
    for (const row of rows) {
      const product = productById.get(row.productId.toString());
      const available = Math.max(0, (row.onHand ?? 0) - (row.reserved ?? 0));
      const base = {
        Product: product?.name ?? 'Unknown product',
        Generic: product?.genericName ?? '',
        Brand: product?.brand ?? '',
        Form: product?.form ?? '',
        Strength: product?.strength ?? '',
        'On hand': row.onHand ?? 0,
        Reserved: row.reserved ?? 0,
        Available: available,
        'Reorder level': row.reorderLevel ?? 0,
      };
      const batches = row.batches ?? [];
      if (batches.length === 0) {
        records.push({ ...base, 'Batch no': '', Expiry: '', 'Batch qty': '' });
        continue;
      }
      for (const batch of batches) {
        records.push({
          ...base,
          'Batch no': batch.batchNo,
          Expiry: new Date(batch.expiry).toISOString().slice(0, 10),
          'Batch qty': batch.quantity,
        });
      }
    }

    const sheet = XLSX.utils.json_to_sheet(records);
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === 'csv') {
      return {
        buffer: Buffer.from(XLSX.utils.sheet_to_csv(sheet), 'utf8'),
        filename: `inventory-${stamp}.csv`,
        contentType: 'text/csv',
      };
    }
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Inventory');
    return {
      buffer: XLSX.write(book, { bookType: 'xlsx', type: 'buffer' }) as Buffer,
      filename: `inventory-${stamp}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  async receive(
    branchId: string,
    actorId: string,
    input: ReceiveInventoryInput,
  ): Promise<BranchInventoryItemDto> {
    const productName = await this.requireProductName(input.productId);
    await this.applyManualMutation(branchId, actorId, {
      productId: input.productId,
      productName,
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
    const productName = await this.requireProductName(input.productId);
    await this.applyManualMutation(branchId, actorId, {
      productId: input.productId,
      productName,
      quantityDelta: input.quantityDelta,
      reorderLevel: input.reorderLevel,
      batchNo: input.batchNo,
      expiry: input.expiry,
      reason: input.reason,
      movementType: StockMovementType.ADJUST,
    });
    return this.getBranchInventoryItem(branchId, input.productId);
  }

  /**
   * Receive stock against a supplier invoice (GRN): one entry = vendor + invoice
   * number + supply date + multiple product lines. Every movement references the
   * invoice, lines may set price/cost/storefront visibility at reception, and ONE
   * invoice-level audit entry records the whole delivery in human terms.
   *
   * All lines are validated up-front, then the invoice, stock, movements, and prices
   * commit atomically so a mid-invoice failure cannot leave a partial receipt.
   */
  async receiveInvoice(
    branchId: string,
    actorId: string,
    input: ReceiveInvoiceInput,
  ): Promise<StockInvoiceDto> {
    input = await this.normalizeInvoiceVendor(input);
    if (input.idempotencyKey) {
      const existing = await this.invoiceModel.findOne({
        branchId: new Types.ObjectId(branchId),
        idempotencyKey: input.idempotencyKey,
      });
      if (existing) return this.toInvoiceDto(existing.toObject(), undefined);
    }
    const asDraft = input.asDraft === true;
    // Drafts snapshot names + validate products exist, but skip the visible-without-price
    // guard (nothing is applied yet) and never touch stock/prices.
    const { nameById, existingPrices } = await this.resolveInvoiceProducts(branchId, input, {
      requirePriceForVisible: !asDraft,
    });

    if (asDraft) {
      const [invoice] = await this.invoiceModel.create([
        this.buildInvoiceDoc(branchId, actorId, input, nameById, 'draft'),
      ]);
      const invoiceId = invoice._id.toString();
      await this.recordInvoiceAudit(
        branchId,
        actorId,
        invoiceId,
        'inventory.invoice_draft',
        `Draft invoice ${input.invoiceNo} from ${input.vendorName} saved — ${input.lines.length} product(s)`,
        input,
        nameById,
      );
      return this.toInvoiceDto(invoice.toObject(), undefined);
    }

    let invoice!: StockInvoice & { _id: Types.ObjectId; toObject(): Record<string, unknown> };
    try {
      await this.tx.run(async (session) => {
        [invoice] = await this.invoiceModel.create(
          [this.buildInvoiceDoc(branchId, actorId, input, nameById, 'received')],
          { session },
        );
        await this.applyInvoiceLines(
          branchId,
          actorId,
          input,
          invoice._id.toString(),
          existingPrices,
          nameById,
          session,
        );
      });
    } catch (error) {
      if (input.idempotencyKey && this.isDuplicateKey(error)) {
        const existing = await this.invoiceModel.findOne({
          branchId: new Types.ObjectId(branchId),
          idempotencyKey: input.idempotencyKey,
        });
        if (existing) return this.toInvoiceDto(existing.toObject(), undefined);
      }
      throw error;
    }
    const invoiceId = invoice._id.toString();
    await this.recordReceiveAudit(branchId, actorId, input, invoiceId, nameById);
    return this.toInvoiceDto(invoice.toObject() as never, undefined);
  }

  /** Update the payload of an existing DRAFT invoice (received invoices are immutable here). */
  async updateInvoice(
    branchId: string,
    actorId: string,
    id: string,
    input: ReceiveInvoiceInput,
  ): Promise<StockInvoiceDto> {
    const invoice = await this.invoiceModel.findOne({
      _id: new Types.ObjectId(id),
      branchId: new Types.ObjectId(branchId),
    });
    if (!invoice) throw new DomainError(ErrorCode.NOT_FOUND, 'Invoice not found');
    if (invoice.status !== 'draft') {
      throw new DomainError(ErrorCode.CONFLICT, 'Only draft invoices can be edited');
    }

    input = await this.normalizeInvoiceVendor(input);
    const { nameById } = await this.resolveInvoiceProducts(branchId, input, {
      requirePriceForVisible: false,
    });
    const doc = this.buildInvoiceDoc(branchId, actorId, input, nameById, 'draft');
    invoice.vendorId = doc.vendorId;
    invoice.vendorName = doc.vendorName;
    invoice.invoiceNo = doc.invoiceNo;
    invoice.invoiceDate = doc.invoiceDate;
    invoice.note = doc.note;
    invoice.paymentStatus = doc.paymentStatus;
    invoice.paymentDueDate = doc.paymentDueDate;
    invoice.lines = doc.lines as typeof invoice.lines;
    await invoice.save();

    await this.recordInvoiceAudit(
      branchId,
      actorId,
      id,
      'inventory.invoice_draft',
      `Draft invoice ${input.invoiceNo} from ${input.vendorName} updated — ${input.lines.length} product(s)`,
      input,
      nameById,
    );
    return this.toInvoiceDto(invoice.toObject(), undefined);
  }

  /** Publish a draft: full validation, apply stock + price/visibility, mark received. */
  async publishInvoice(branchId: string, actorId: string, id: string): Promise<StockInvoiceDto> {
    const invoice = await this.invoiceModel.findOne({
      _id: new Types.ObjectId(id),
      branchId: new Types.ObjectId(branchId),
    });
    if (!invoice) throw new DomainError(ErrorCode.NOT_FOUND, 'Invoice not found');
    if (invoice.status !== 'draft') {
      throw new DomainError(ErrorCode.CONFLICT, 'Invoice is already received');
    }

    const input = this.invoiceDocToInput(invoice);
    const { nameById, existingPrices } = await this.resolveInvoiceProducts(branchId, input, {
      requirePriceForVisible: true,
    });
    await this.tx.run(async (session) => {
      const draft = await this.invoiceModel.findOne(
        { _id: new Types.ObjectId(id), branchId: new Types.ObjectId(branchId), status: 'draft' },
        null,
        { session },
      );
      if (!draft) throw new DomainError(ErrorCode.CONFLICT, 'Invoice is already received');

      await this.applyInvoiceLines(branchId, actorId, input, id, existingPrices, nameById, session);
      draft.status = 'received';
      await draft.save({ session });
      invoice.status = 'received';
    });
    await this.recordReceiveAudit(branchId, actorId, input, id, nameById);
    return this.toInvoiceDto(invoice.toObject(), undefined);
  }

  /** Delete a draft invoice (received invoices cannot be deleted). */
  async deleteInvoice(branchId: string, actorId: string, id: string): Promise<void> {
    const invoice = await this.invoiceModel.findOne({
      _id: new Types.ObjectId(id),
      branchId: new Types.ObjectId(branchId),
    });
    if (!invoice) throw new DomainError(ErrorCode.NOT_FOUND, 'Invoice not found');
    if (invoice.status !== 'draft') {
      throw new DomainError(ErrorCode.CONFLICT, 'Only draft invoices can be deleted');
    }
    await this.invoiceModel.deleteOne({ _id: invoice._id });
    if (invoice.attachmentKey) {
      try {
        await this.storage.deleteObject(invoice.attachmentKey);
      } catch (error) {
        this.logger.error(
          `Could not delete invoice attachment: key=${invoice.attachmentKey} reason=${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }
    await this.recordInvoiceAudit(
      branchId,
      actorId,
      id,
      'inventory.invoice_draft_deleted',
      `Draft invoice ${invoice.invoiceNo} from ${invoice.vendorName} deleted`,
    );
  }

  /**
   * Reverse a received invoice only while every received line can still be removed from stock.
   * The original invoice and its receive movements stay in the audit trail; compensating
   * negative movements make the correction explicit.
   */
  async voidInvoice(branchId: string, actorId: string, id: string): Promise<StockInvoiceDto> {
    const invoice = await this.invoiceModel.findOne({
      _id: new Types.ObjectId(id),
      branchId: new Types.ObjectId(branchId),
    });
    if (!invoice) throw new DomainError(ErrorCode.NOT_FOUND, 'Invoice not found');
    if (invoice.status !== 'received') {
      throw new DomainError(ErrorCode.CONFLICT, 'Only received invoices can be voided');
    }

    const input = this.invoiceDocToInput(invoice);
    await this.tx.run(async (session) => {
      const current = await this.invoiceModel.findOne(
        { _id: new Types.ObjectId(id), branchId: new Types.ObjectId(branchId), status: 'received' },
        null,
        { session },
      );
      if (!current) throw new DomainError(ErrorCode.CONFLICT, 'Invoice is already voided');

      for (const line of input.lines) {
        await this.applyManualMutation(
          branchId,
          actorId,
          {
            productId: line.productId,
            quantityDelta: -line.quantity,
            batchNo: line.batchNo,
            expiry: line.expiry,
            reason: `Void invoice ${input.invoiceNo} — ${input.vendorName}`,
            movementType: StockMovementType.ADJUST,
            invoiceId: id,
            suppressAudit: true,
          },
          session,
        );
      }
      current.status = 'voided';
      await current.save({ session });
      invoice.status = 'voided';
    });

    await this.recordInvoiceAudit(
      branchId,
      actorId,
      id,
      'inventory.invoice_voided',
      `Received invoice ${invoice.invoiceNo} from ${invoice.vendorName} voided; stock reversed`,
    );
    return this.toInvoiceDto(invoice.toObject(), undefined);
  }

  /** Update an invoice's payment status (paid/unpaid + expected date). Audited. */
  async updateInvoicePayment(
    branchId: string,
    actorId: string,
    id: string,
    input: { paymentStatus: 'paid' | 'unpaid'; paymentDueDate?: Date },
  ): Promise<StockInvoiceDto> {
    const invoice = await this.invoiceModel.findOne({
      _id: new Types.ObjectId(id),
      branchId: new Types.ObjectId(branchId),
    });
    if (!invoice) throw new DomainError(ErrorCode.NOT_FOUND, 'Invoice not found');

    invoice.paymentStatus = input.paymentStatus;
    invoice.paymentDueDate = input.paymentStatus === 'unpaid' ? input.paymentDueDate : undefined;
    await invoice.save();

    const verb = input.paymentStatus === 'paid' ? 'paid' : 'unpaid';
    await this.recordInvoiceAudit(
      branchId,
      actorId,
      id,
      'inventory.invoice_paid',
      `Invoice ${invoice.invoiceNo} from ${invoice.vendorName} marked ${verb}`,
    );
    return this.toInvoiceDto(invoice.toObject(), undefined);
  }

  /** Attach (or replace) the scanned invoice document — an audit artefact. */
  async attachInvoiceScan(
    branchId: string,
    actorId: string,
    id: string,
    file: UploadedInvoiceScan,
  ): Promise<StockInvoiceDto> {
    const invoice = await this.invoiceModel.findOne({
      _id: new Types.ObjectId(id),
      branchId: new Types.ObjectId(branchId),
    });
    if (!invoice) throw new DomainError(ErrorCode.NOT_FOUND, 'Invoice not found');

    const previousObjectKey = invoice.attachmentKey;
    const objectKey = `invoices/${branchId}/${id}/${randomUUID()}.${file.ext}`;
    await this.storage.putObject(objectKey, file.buffer, file.mime);
    invoice.attachmentKey = objectKey;
    try {
      await invoice.save();
    } catch (error) {
      await this.storage.deleteObject(objectKey).catch(() => undefined);
      throw error;
    }
    if (previousObjectKey) {
      try {
        await this.storage.deleteObject(previousObjectKey);
      } catch (error) {
        this.logger.error(
          `Could not delete replaced invoice attachment: key=${previousObjectKey} reason=${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }

    await this.recordInvoiceAudit(
      branchId,
      actorId,
      id,
      'inventory.invoice_attachment',
      `Scanned invoice attached to ${invoice.invoiceNo} from ${invoice.vendorName}`,
    );
    return this.toInvoiceDto(invoice.toObject(), undefined);
  }

  /** Signed URL for the scanned invoice attachment (short-lived). */
  async getInvoiceAttachmentUrl(branchId: string, id: string): Promise<SignedFileUrlDto> {
    const invoice = await this.invoiceModel
      .findOne({ _id: new Types.ObjectId(id), branchId: new Types.ObjectId(branchId) })
      .lean<{ attachmentKey?: string } | null>();
    if (!invoice) throw new DomainError(ErrorCode.NOT_FOUND, 'Invoice not found');
    if (!invoice.attachmentKey) {
      throw new DomainError(ErrorCode.NOT_FOUND, 'No scanned invoice attached');
    }
    return {
      url: await this.storage.getSignedDownloadUrl(invoice.attachmentKey),
      expiresInSeconds: this.storage.signedUrlTtl,
    };
  }

  /* ── invoice helpers ── */

  private async normalizeInvoiceVendor(input: ReceiveInvoiceInput): Promise<ReceiveInvoiceInput> {
    if (!input.vendorId) return input;
    const vendor = await this.vendorModel
      .findOne({
        _id: new Types.ObjectId(input.vendorId),
        isActive: true,
        deletedAt: { $exists: false },
      })
      .select('name')
      .lean<{ name: string } | null>();
    if (!vendor) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Select an active vendor');
    }
    return { ...input, vendorName: vendor.name };
  }

  /** Resolve product names, existing prices, and validate lines before persisting. */
  private async resolveInvoiceProducts(
    branchId: string,
    input: ReceiveInvoiceInput,
    opts: { requirePriceForVisible: boolean },
  ): Promise<{ nameById: Map<string, string>; existingPrices: Map<string, PriceEntry> }> {
    const productIds = input.lines.map((line) => line.productId);
    const products = await this.productModel
      .find({ _id: { $in: productIds.map((id) => new Types.ObjectId(id)) } })
      .select('name')
      .lean<Array<{ _id: Types.ObjectId; name?: string }>>();
    const nameById = new Map(products.map((p) => [p._id.toString(), p.name ?? 'Unknown product']));

    const existingPrices = await this.pricing.getPriceMap(branchId, productIds);
    const problems: Array<{ field: string; issue: string }> = [];
    input.lines.forEach((line, index) => {
      const name = nameById.get(line.productId);
      if (!name) {
        problems.push({ field: `lines[${index}]`, issue: 'Unknown product' });
        return;
      }
      if (
        opts.requirePriceForVisible &&
        line.visibleOnStorefront === true &&
        line.priceKobo == null &&
        !existingPrices.get(line.productId)
      ) {
        problems.push({
          field: name,
          issue: 'set a selling price to make this product visible on the storefront',
        });
      }
    });
    if (problems.length > 0) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Invoice has invalid lines', problems);
    }
    return { nameById, existingPrices };
  }

  /** Shape the persisted invoice document (product names snapshotted for readability). */
  private buildInvoiceDoc(
    branchId: string,
    actorId: string,
    input: ReceiveInvoiceInput,
    nameById: Map<string, string>,
    status: 'draft' | 'received',
  ) {
    return {
      branchId: new Types.ObjectId(branchId),
      vendorId: input.vendorId ? new Types.ObjectId(input.vendorId) : undefined,
      vendorName: input.vendorName,
      invoiceNo: input.invoiceNo,
      invoiceDate: input.invoiceDate,
      note: input.note,
      status,
      paymentStatus: input.paymentStatus,
      paymentDueDate: input.paymentStatus === 'unpaid' ? input.paymentDueDate : undefined,
      idempotencyKey: input.idempotencyKey,
      receivedByStaffId: new Types.ObjectId(actorId),
      lines: input.lines.map((line) => ({
        productId: new Types.ObjectId(line.productId),
        productName: nameById.get(line.productId)!,
        quantity: line.quantity,
        batchNo: line.batchNo,
        expiry: line.expiry,
        costKobo: line.costKobo,
        priceKobo: line.priceKobo,
        reorderLevel: line.reorderLevel,
        visibleOnStorefront: line.visibleOnStorefront,
      })),
    };
  }

  /** Reconstruct a ReceiveInvoiceInput from a stored invoice document (for publish). */
  private invoiceDocToInput(invoice: {
    vendorId?: Types.ObjectId;
    vendorName: string;
    invoiceNo: string;
    invoiceDate: Date;
    note?: string;
    paymentStatus: 'paid' | 'unpaid';
    paymentDueDate?: Date;
    idempotencyKey?: string;
    lines: Array<{
      productId: Types.ObjectId;
      quantity: number;
      batchNo?: string;
      expiry?: Date;
      costKobo?: number;
      priceKobo?: number;
      reorderLevel?: number;
      visibleOnStorefront?: boolean;
    }>;
  }): ReceiveInvoiceInput {
    return {
      vendorId: invoice.vendorId?.toString(),
      vendorName: invoice.vendorName,
      invoiceNo: invoice.invoiceNo,
      invoiceDate: invoice.invoiceDate,
      note: invoice.note,
      paymentStatus: invoice.paymentStatus,
      paymentDueDate: invoice.paymentDueDate,
      lines: invoice.lines.map((line) => ({
        productId: line.productId.toString(),
        quantity: line.quantity,
        batchNo: line.batchNo,
        expiry: line.expiry,
        costKobo: line.costKobo,
        priceKobo: line.priceKobo,
        reorderLevel: line.reorderLevel,
        visibleOnStorefront: line.visibleOnStorefront ?? false,
      })),
    };
  }

  /** Apply stock movements + optional price/visibility upserts for every line. */
  private async applyInvoiceLines(
    branchId: string,
    actorId: string,
    input: ReceiveInvoiceInput,
    invoiceId: string,
    existingPrices: Map<string, PriceEntry>,
    nameById: Map<string, string>,
    session: ClientSession,
  ): Promise<void> {
    for (const line of input.lines) {
      await this.applyManualMutation(
        branchId,
        actorId,
        {
          productId: line.productId,
          productName: nameById.get(line.productId),
          quantityDelta: line.quantity,
          reorderLevel: line.reorderLevel,
          batchNo: line.batchNo,
          expiry: line.expiry,
          reason: `Invoice ${input.invoiceNo} — ${input.vendorName}`,
          movementType: StockMovementType.RECEIVE,
          invoiceId,
          suppressAudit: true,
        },
        session,
      );

      if (
        line.priceKobo != null ||
        line.costKobo != null ||
        line.visibleOnStorefront !== undefined
      ) {
        const existing = existingPrices.get(line.productId);
        const priceKobo = line.priceKobo ?? existing?.priceKobo;
        if (priceKobo != null) {
          await this.pricing.upsertPrice(
            branchId,
            {
              productId: line.productId,
              priceKobo,
              costKobo: line.costKobo ?? existing?.costKobo,
              compareAtKobo: existing?.compareAtKobo,
              isAvailable: line.visibleOnStorefront ?? existing?.isAvailable ?? true,
            },
            session,
          );
        }
      }
    }
  }

  /** One invoice-level "received" audit entry, in human terms. Best-effort. */
  private async recordReceiveAudit(
    branchId: string,
    actorId: string,
    input: ReceiveInvoiceInput,
    invoiceId: string,
    nameById: Map<string, string>,
  ): Promise<void> {
    const totalUnits = input.lines.reduce((sum, line) => sum + line.quantity, 0);
    const supplied = input.invoiceDate.toISOString().slice(0, 10);
    try {
      await this.audit.record({
        actorId,
        actorType: ActorType.STAFF,
        action: 'inventory.receive_invoice',
        summary: `Invoice ${input.invoiceNo} from ${input.vendorName} (supplied ${supplied}) — ${input.lines.length} product(s), ${totalUnits} units received`,
        targetType: 'stock_invoice',
        targetId: invoiceId,
        branchId,
        metadata: {
          vendorName: input.vendorName,
          invoiceNo: input.invoiceNo,
          invoiceDate: supplied,
          totalUnits,
          lines: input.lines.map((line) => ({
            product: nameById.get(line.productId),
            quantity: line.quantity,
            batchNo: line.batchNo,
            expiry: line.expiry?.toISOString().slice(0, 10),
          })),
        },
      });
    } catch (error) {
      this.logger.warn(
        `Invoice audit write failed: branch=${branchId} invoice=${input.invoiceNo} reason=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** Lightweight invoice audit entry (draft save/update/delete, payment change). */
  private async recordInvoiceAudit(
    branchId: string,
    actorId: string,
    invoiceId: string,
    action: string,
    summary: string,
    input?: ReceiveInvoiceInput,
    nameById?: Map<string, string>,
  ): Promise<void> {
    try {
      await this.audit.record({
        actorId,
        actorType: ActorType.STAFF,
        action,
        summary,
        targetType: 'stock_invoice',
        targetId: invoiceId,
        branchId,
        metadata: input
          ? {
              vendorName: input.vendorName,
              invoiceNo: input.invoiceNo,
              totalUnits: input.lines.reduce((sum, line) => sum + line.quantity, 0),
              lines: input.lines.map((line) => ({
                product: nameById?.get(line.productId),
                quantity: line.quantity,
              })),
            }
          : undefined,
      });
    } catch (error) {
      this.logger.warn(
        `Invoice audit write failed: branch=${branchId} invoice=${invoiceId} reason=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** Goods-received history for a branch, newest first, cursor-paginated. */
  async listInvoices(
    branchId: string,
    query: StockInvoiceQuery,
  ): Promise<Paginated<StockInvoiceDto>> {
    const filter: Record<string, unknown> = {
      branchId: new Types.ObjectId(branchId),
      ...cursorFilterDesc(query.cursor),
    };
    if (query.status) filter.status = query.status;
    const rows = await this.invoiceModel
      .find(filter)
      .sort({ _id: -1 })
      .limit(query.limit + 1)
      .lean();

    const staffIds = [...new Set(rows.map((row) => row.receivedByStaffId?.toString()))].filter(
      (id): id is string => Boolean(id),
    );
    const staff = staffIds.length
      ? await this.staffModel
          .find({ _id: { $in: staffIds.map((id) => new Types.ObjectId(id)) } })
          .select('firstName lastName')
          .lean<Array<{ _id: Types.ObjectId; firstName?: string; lastName?: string }>>()
      : [];
    const staffById = new Map(
      staff.map((s) => [s._id.toString(), [s.firstName, s.lastName].filter(Boolean).join(' ')]),
    );

    const mapped = rows.map((row) =>
      this.toInvoiceDto(row, staffById.get(row.receivedByStaffId?.toString() ?? '')),
    );
    return paginate(mapped, query.limit);
  }

  private toInvoiceDto(
    row: {
      _id: Types.ObjectId;
      branchId: Types.ObjectId;
      vendorId?: Types.ObjectId;
      vendorName: string;
      invoiceNo: string;
      invoiceDate: Date;
      note?: string;
      status?: 'draft' | 'received' | 'voided';
      paymentStatus?: 'paid' | 'unpaid';
      paymentDueDate?: Date;
      idempotencyKey?: string;
      attachmentKey?: string;
      receivedByStaffId: Types.ObjectId;
      lines: Array<{
        productId: Types.ObjectId;
        productName: string;
        quantity: number;
        batchNo?: string;
        expiry?: Date;
        costKobo?: number;
        priceKobo?: number;
        reorderLevel?: number;
        visibleOnStorefront?: boolean;
      }>;
      createdAt?: Date;
    },
    receivedByName?: string,
  ): StockInvoiceDto {
    return {
      id: row._id.toString(),
      branchId: row.branchId.toString(),
      vendorId: row.vendorId?.toString(),
      vendorName: row.vendorName,
      invoiceNo: row.invoiceNo,
      invoiceDate: row.invoiceDate.toISOString(),
      note: row.note,
      status: row.status ?? 'received',
      paymentStatus: row.paymentStatus ?? 'unpaid',
      paymentDueDate: row.paymentDueDate?.toISOString(),
      idempotencyKey: row.idempotencyKey,
      hasAttachment: Boolean(row.attachmentKey),
      receivedById: row.receivedByStaffId.toString(),
      receivedByName: receivedByName || undefined,
      totalUnits: row.lines.reduce((sum, line) => sum + line.quantity, 0),
      lines: row.lines.map((line) => ({
        productId: line.productId.toString(),
        productName: line.productName,
        quantity: line.quantity,
        batchNo: line.batchNo,
        expiry: line.expiry?.toISOString(),
        costKobo: line.costKobo,
        priceKobo: line.priceKobo,
        reorderLevel: line.reorderLevel,
        visibleOnStorefront: line.visibleOnStorefront,
      })),
      createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    };
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
    await this.movement(
      StockMovementType.DISPENSE,
      branchId,
      productId,
      -qty,
      { orderId },
      session,
    );
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

  /**
   * Book returned goods back onto the shelf (POS sale return). Increments `onHand`
   * and appends a RETURN movement. Like `dispense`, this deliberately does not touch
   * the batches array — batch quantities track receive/adjust only.
   */
  async returnStock(
    branchId: string,
    productId: string,
    qty: number,
    actorId: string,
    orderId: string,
    reason: string,
    session?: ClientSession,
  ): Promise<void> {
    await this.inventoryModel.updateOne(
      { branchId: new Types.ObjectId(branchId), productId: new Types.ObjectId(productId) },
      { $inc: { onHand: qty } },
      { session, upsert: true, setDefaultsOnInsert: true },
    );
    await this.movement(
      StockMovementType.RETURN,
      branchId,
      productId,
      qty,
      { orderId, actorId, reason, refType: 'order' },
      session,
    );
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
    session?: ClientSession,
  ): Promise<void> {
    const branchObjectId = new Types.ObjectId(branchId);
    const productObjectId = new Types.ObjectId(input.productId);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const current = await this.inventoryModel
        .findOne({ branchId: branchObjectId, productId: productObjectId }, null, { session })
        .lean<InventorySnapshot | null>();

      if (!current) {
        if (input.quantityDelta < 0) {
          throw new DomainError(ErrorCode.NOT_FOUND, 'Inventory item not found');
        }

        const batches = this.applyBatchDelta([], input.quantityDelta, input.batchNo, input.expiry);

        try {
          const docs = [
            {
              branchId: branchObjectId,
              productId: productObjectId,
              onHand: input.quantityDelta,
              reserved: 0,
              reorderLevel: input.reorderLevel ?? 0,
              batches,
            },
          ];
          if (session) await this.inventoryModel.create(docs, { session });
          else await this.inventoryModel.create(docs);
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
            refType: input.invoiceId ? 'invoice' : 'manual',
            invoiceId: input.invoiceId,
          },
          session,
        );
        if (!input.suppressAudit) {
          await this.recordManualAudit(
            branchId,
            actorId,
            input,
            { onHand: 0, reserved: 0, reorderLevel: 0, batchCount: 0 },
            {
              onHand: input.quantityDelta,
              reserved: 0,
              reorderLevel: input.reorderLevel ?? 0,
              batchCount: batches.length,
            },
          );
        }
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

      const filter = { _id: current._id, onHand: currentOnHand, reserved: currentReserved };
      const mutation = {
        $set: {
          onHand: nextOnHand,
          reorderLevel: input.reorderLevel ?? current.reorderLevel ?? 0,
          batches: nextBatches,
        },
      };
      const update = session
        ? await this.inventoryModel.updateOne(filter, mutation, { session })
        : await this.inventoryModel.updateOne(filter, mutation);

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
          refType: input.invoiceId ? 'invoice' : 'manual',
          invoiceId: input.invoiceId,
        },
        session,
      );
      if (!input.suppressAudit) {
        await this.recordManualAudit(
          branchId,
          actorId,
          input,
          {
            onHand: currentOnHand,
            reserved: currentReserved,
            reorderLevel: current.reorderLevel ?? 0,
            batchCount: current.batches?.length ?? 0,
          },
          {
            onHand: nextOnHand,
            reserved: currentReserved,
            reorderLevel: input.reorderLevel ?? current.reorderLevel ?? 0,
            batchCount: nextBatches.length,
          },
        );
      }
      return;
    }

    throw new DomainError(
      ErrorCode.CONFLICT,
      'Inventory changed during update, retry the operation',
    );
  }

  /**
   * Write a compliance audit entry for a manual stock action (receive/adjust) to the
   * platform-wide audit log. Best-effort and non-transactional — mirrors the other
   * manual-action call sites; the stock_movements ledger remains the source of truth.
   */
  private async recordManualAudit(
    branchId: string,
    actorId: string,
    input: ManualInventoryMutation,
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): Promise<void> {
    const productName = input.productName ?? 'product';
    const batchSuffix = input.batchNo
      ? ` (batch ${input.batchNo}${input.expiry ? `, exp ${input.expiry.toISOString().slice(0, 10)}` : ''})`
      : '';
    const summary =
      input.movementType === StockMovementType.RECEIVE
        ? `Received ${input.quantityDelta} × ${productName}${batchSuffix}`
        : `Adjusted ${productName} by ${input.quantityDelta > 0 ? '+' : ''}${input.quantityDelta}${batchSuffix} — ${input.reason}`;
    try {
      await this.audit.record({
        actorId,
        actorType: ActorType.STAFF,
        action:
          input.movementType === StockMovementType.RECEIVE
            ? 'inventory.receive'
            : 'inventory.adjust',
        summary,
        targetType: 'inventory',
        targetId: input.productId,
        branchId,
        metadata: {
          product: input.productName,
          quantityDelta: input.quantityDelta,
          reason: input.reason,
          batchNo: input.batchNo,
          reorderLevel: input.reorderLevel,
        },
        before,
        after,
      });
    } catch (error) {
      this.logger.warn(
        `Inventory audit write failed: branch=${branchId} product=${input.productId} reason=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
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
        throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Batch not found for stock adjustment', [
          { field: 'batchNo', issue: 'unknown batch' },
        ]);
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
      (left, right) =>
        left.expiry.getTime() - right.expiry.getTime() || left.batchNo.localeCompare(right.batchNo),
    );
  }

  private lowStockThreshold(reorderLevel: number): number {
    return Math.max(1, reorderLevel);
  }

  /** Load the product name (also asserts the product exists). */
  private async requireProductName(productId: string): Promise<string> {
    const product = await this.productModel
      .findById(new Types.ObjectId(productId))
      .select('name')
      .lean<{ name?: string } | null>();
    if (!product) throw new DomainError(ErrorCode.NOT_FOUND, 'Product not found');
    return product.name ?? 'Unknown product';
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
      refId: options.invoiceId
        ? new Types.ObjectId(options.invoiceId)
        : options.orderId
          ? new Types.ObjectId(options.orderId)
          : undefined,
      batchNo: options.batchNo,
      actorId: options.actorId ? new Types.ObjectId(options.actorId) : undefined,
      reason: options.reason,
    };
    await this.movementModel.create(session ? [doc] : [doc], session ? { session } : undefined);
  }
}
