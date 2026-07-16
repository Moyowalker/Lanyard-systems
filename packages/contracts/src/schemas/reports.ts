import { z } from 'zod';

// Admin reporting / insights. Read-only aggregates over orders; branch-scoped server-side.

const reportObjectId = z.string().regex(/^[a-f\d]{24}$/i, 'must be a 24-char ObjectId');

export const ReportRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  /** Narrow to a single branch (must be within the caller's branch scope). */
  branchId: reportObjectId.optional(),
  /** Narrow to pickup, delivery, or counter (POS) orders. */
  fulfillmentType: z.enum(['pickup', 'delivery', 'counter']).optional(),
});
export type ReportRangeQuery = z.infer<typeof ReportRangeSchema>;

export interface SalesByDay {
  /** ISO date (yyyy-mm-dd). */
  date: string;
  revenueKobo: number;
  orders: number;
}

export interface TopProduct {
  productId: string;
  name: string;
  quantity: number;
  revenueKobo: number;
}

export interface SalesSummaryDto {
  from: string;
  to: string;
  paidOrders: number;
  revenueKobo: number;
  /** Average order value across paid orders. */
  aovKobo: number;
  rxOrders: number;
  otcOrders: number;
  refunds: number;
  refundedKobo: number;
  byDay: SalesByDay[];
  topProducts: TopProduct[];
}

/* ── Inventory valuation report (point-in-time stock at cost & selling price) ── */

export const InventoryValuationQuerySchema = z.object({
  branchId: reportObjectId.optional(),
});
export type InventoryValuationQuery = z.infer<typeof InventoryValuationQuerySchema>;

export interface InventoryValuationRow {
  productId: string;
  name: string;
  sku?: string;
  genericName?: string;
  brand?: string;
  form?: string;
  onHand: number;
  available: number;
  costKobo?: number;
  sellingKobo?: number;
  stockCostKobo: number;
  stockSellingKobo: number;
}

export interface InventoryValuationDto {
  generatedAt: string;
  /** Distinct drugs (products) with a stock row. */
  totalDrugs: number;
  /** Sum of on-hand units across all rows. */
  totalQuantity: number;
  totalCostKobo: number;
  totalSellingKobo: number;
  rows: InventoryValuationRow[];
}

/* ── Consumption report (units dispensed over a window) ── */

export interface ConsumptionRow {
  productId: string;
  name: string;
  sku?: string;
  genericName?: string;
  brand?: string;
  form?: string;
  unitsDispensed: number;
  movements: number;
  costKobo?: number;
  sellingKobo?: number;
  valueKobo: number;
  /** unitsDispensed × costKobo — absent when the branch has no cost on file. */
  valueAtCostKobo?: number;
  /** valueKobo − valueAtCostKobo — absent when cost is unknown. */
  marginKobo?: number;
}

/** Revenue grouped by how customers paid (cash/card/transfer/HMO at the till; 'online' otherwise). */
export interface PaymentChannelBreakdownRow {
  channel: string;
  totalKobo: number;
  orders: number;
}

export interface ConsumptionReportDto {
  from: string;
  to: string;
  totalUnits: number;
  totalValueKobo: number;
  totalValueAtCostKobo: number;
  totalMarginKobo: number;
  rows: ConsumptionRow[];
  paymentBreakdown: PaymentChannelBreakdownRow[];
}

/* ── Low stock report (items at/below their reorder threshold, branch-scoped) ── */

export interface LowStockRow {
  productId: string;
  productName: string;
  genericName?: string;
  brand?: string;
  form?: string;
  branchId: string;
  branchName: string;
  onHand: number;
  reserved: number;
  available: number;
  reorderLevel: number;
  status: 'out' | 'low';
}

export interface LowStockReportDto {
  generatedAt: string;
  totalItems: number;
  outOfStock: number;
  rows: LowStockRow[];
}

/* ── Expiring drugs report ──
 * Horizon defaults to 9 months (270 days). Banding is computed server-side so the
 * UI and exports agree: expired ≤ 0 days, red ≤ 180 days (6 months), yellow ≤ horizon. */

export const ExpiringReportQuerySchema = z.object({
  branchId: reportObjectId.optional(),
  days: z.coerce.number().int().min(1).max(365).default(270),
});
export type ExpiringReportQuery = z.infer<typeof ExpiringReportQuerySchema>;

export const LowStockQuerySchema = z.object({
  branchId: reportObjectId.optional(),
});
export type LowStockQuery = z.infer<typeof LowStockQuerySchema>;

export type ExpiryBand = 'expired' | 'red' | 'yellow';

export interface ExpiringRow {
  productId: string;
  productName: string;
  genericName?: string;
  brand?: string;
  form?: string;
  branchId: string;
  branchName: string;
  onHand: number;
  batchCount: number;
  nextExpiry: string;
  daysLeft: number;
  band: ExpiryBand;
}

export interface ExpiringReportDto {
  generatedAt: string;
  horizonDays: number;
  expired: number;
  red: number;
  yellow: number;
  rows: ExpiringRow[];
}

/* ── Export ── */

const reportFormat = z.enum(['xlsx', 'csv']).default('xlsx');

/** Sales export = sales filters + a format. */
export const SalesExportSchema = ReportRangeSchema.extend({ format: reportFormat });
export type SalesExportQuery = z.infer<typeof SalesExportSchema>;

export const InventoryValuationExportSchema = InventoryValuationQuerySchema.extend({
  format: reportFormat,
});
export type InventoryValuationExportQuery = z.infer<typeof InventoryValuationExportSchema>;

export const ConsumptionExportSchema = ReportRangeSchema.extend({ format: reportFormat });
export type ConsumptionExportQuery = z.infer<typeof ConsumptionExportSchema>;

export const LowStockExportSchema = LowStockQuerySchema.extend({ format: reportFormat });
export type LowStockExportQuery = z.infer<typeof LowStockExportSchema>;

export const ExpiringExportSchema = ExpiringReportQuerySchema.extend({ format: reportFormat });
export type ExpiringExportQuery = z.infer<typeof ExpiringExportSchema>;
