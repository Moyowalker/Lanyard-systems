import { z } from 'zod';

import { StockMovementType } from '../enums';
import { PaginationQuerySchema } from './common';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'must be a 24-char ObjectId');

const stockReason = z.string().trim().min(3).max(240);
const batchNo = z.string().trim().min(1).max(120);

function requireBatchPair<T extends z.ZodObject<any>>(schema: T) {
  return schema.superRefine((value, ctx) => {
    const hasBatchNo = Boolean(value.batchNo);
    const hasExpiry = Boolean(value.expiry);

    if (hasBatchNo === hasExpiry) return;

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['batchNo'],
      message: 'batchNo and expiry must be provided together',
    });
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expiry'],
      message: 'batchNo and expiry must be provided together',
    });
  });
}

const InventoryMutationBaseSchema = z.object({
  productId: objectId,
  reorderLevel: z.coerce.number().int().min(0).optional(),
  batchNo: batchNo.optional(),
  expiry: z.coerce.date().optional(),
});

export const ReceiveInventorySchema = requireBatchPair(
  InventoryMutationBaseSchema.extend({
    quantity: z.coerce.number().int().min(1),
    reason: stockReason.optional(),
  }),
);
export type ReceiveInventoryInput = z.infer<typeof ReceiveInventorySchema>;

export const AdjustInventorySchema = requireBatchPair(
  InventoryMutationBaseSchema.extend({
    quantityDelta: z.coerce
      .number()
      .int()
      .refine((value) => value !== 0, 'quantityDelta must be non-zero'),
    reason: stockReason,
  }),
);
export type AdjustInventoryInput = z.infer<typeof AdjustInventorySchema>;

export interface BranchInventoryItemDto {
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
  isLowStock: boolean;
}

/** Items whose soonest batch expires within `days` (default 90). */
export const InventoryExpiringQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(90),
});
export type InventoryExpiringQuery = z.infer<typeof InventoryExpiringQuerySchema>;

/** Stock export — one row per batch, as a spreadsheet or CSV. */
export const InventoryExportQuerySchema = z.object({
  format: z.enum(['xlsx', 'csv']).default('xlsx'),
});
export type InventoryExportQuery = z.infer<typeof InventoryExportQuerySchema>;

/** Read the append-only stock-movement ledger for a branch, newest first. */
export const StockMovementQuerySchema = PaginationQuerySchema.extend({
  productId: objectId.optional(),
  type: z.nativeEnum(StockMovementType).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type StockMovementQuery = z.infer<typeof StockMovementQuerySchema>;

export interface StockMovementDto {
  id: string;
  productId: string;
  productName: string;
  type: StockMovementType;
  quantity: number;
  refType?: 'order' | 'manual' | 'system' | 'invoice';
  refId?: string;
  batchNo?: string;
  actorId?: string;
  reason?: string;
  at: string;
}

/* ── Invoice-based receiving (GRN) ──
 * One entry = one supplier invoice: vendor, invoice number, supply date, and
 * multiple product lines — the trio the pharmacy audits against. Lines may also
 * set cost/selling price and storefront visibility at the point of reception. */

export const ReceiveInvoiceLineSchema = requireBatchPair(
  z.object({
    productId: objectId,
    quantity: z.coerce.number().int().min(1),
    batchNo: batchNo.optional(),
    expiry: z.coerce.date().optional(),
    reorderLevel: z.coerce.number().int().min(0).optional(),
    costKobo: z.coerce.number().int().min(0).optional(),
    priceKobo: z.coerce.number().int().min(0).optional(),
    // Storefront visibility is decided per line at reception (binary, no "leave unchanged").
    visibleOnStorefront: z.boolean(),
  }),
);

export const InvoicePaymentStatus = z.enum(['paid', 'unpaid']);
export type InvoicePaymentStatusValue = z.infer<typeof InvoicePaymentStatus>;

export const InvoiceStatus = z.enum(['draft', 'received', 'voided']);
export type InvoiceStatusValue = z.infer<typeof InvoiceStatus>;

/** Unpaid invoices must carry an expected payment date. */
const paymentDueDateRefinement = (
  value: { paymentStatus: 'paid' | 'unpaid'; paymentDueDate?: Date },
  ctx: z.RefinementCtx,
) => {
  if (value.paymentStatus === 'unpaid' && !value.paymentDueDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['paymentDueDate'],
      message: 'Expected payment date is required for unpaid invoices',
    });
  }
};

export const ReceiveInvoiceSchema = z
  .object({
    vendorId: objectId.optional(),
    vendorName: z.string().trim().min(1).max(160),
    invoiceNo: z.string().trim().min(1).max(80),
    invoiceDate: z.coerce.date(),
    note: z.string().trim().max(500).optional(),
    paymentStatus: InvoicePaymentStatus,
    paymentDueDate: z.coerce.date().optional(),
    /** Client-generated key that makes a receive retry return the original receipt. */
    idempotencyKey: z.string().uuid().optional(),
    /** When true, persist as an editable draft (no stock/price applied yet). */
    asDraft: z.boolean().optional(),
    lines: z.array(ReceiveInvoiceLineSchema).min(1).max(100),
  })
  .superRefine(paymentDueDateRefinement);
export type ReceiveInvoiceInput = z.infer<typeof ReceiveInvoiceSchema>;

/** Update the payload of an existing DRAFT invoice (same shape, never published here). */
export const UpdateInvoiceSchema = ReceiveInvoiceSchema;
export type UpdateInvoiceInput = z.infer<typeof UpdateInvoiceSchema>;

/** Mark an invoice paid / unpaid (unpaid still needs an expected payment date). */
export const UpdateInvoicePaymentSchema = z
  .object({
    paymentStatus: InvoicePaymentStatus,
    paymentDueDate: z.coerce.date().optional(),
  })
  .superRefine(paymentDueDateRefinement);
export type UpdateInvoicePaymentInput = z.infer<typeof UpdateInvoicePaymentSchema>;

export interface StockInvoiceLineDto {
  productId: string;
  productName: string;
  quantity: number;
  batchNo?: string;
  expiry?: string;
  costKobo?: number;
  priceKobo?: number;
  reorderLevel?: number;
  visibleOnStorefront?: boolean;
}

export interface StockInvoiceDto {
  id: string;
  branchId: string;
  vendorId?: string;
  vendorName: string;
  invoiceNo: string;
  invoiceDate: string;
  note?: string;
  status: InvoiceStatusValue;
  paymentStatus: InvoicePaymentStatusValue;
  paymentDueDate?: string;
  idempotencyKey?: string;
  /** Whether a scanned invoice document has been attached (fetch the URL separately). */
  hasAttachment?: boolean;
  receivedById: string;
  receivedByName?: string;
  totalUnits: number;
  lines: StockInvoiceLineDto[];
  createdAt: string;
}

export const StockInvoiceQuerySchema = PaginationQuerySchema.extend({
  status: InvoiceStatus.optional(),
});
export type StockInvoiceQuery = z.infer<typeof StockInvoiceQuerySchema>;
