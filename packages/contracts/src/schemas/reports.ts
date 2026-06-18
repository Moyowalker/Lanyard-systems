import { z } from 'zod';

// Admin reporting / insights. Read-only aggregates over orders; branch-scoped server-side.

const reportObjectId = z.string().regex(/^[a-f\d]{24}$/i, 'must be a 24-char ObjectId');

export const ReportRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  /** Narrow to a single branch (must be within the caller's branch scope). */
  branchId: reportObjectId.optional(),
  /** Narrow to pickup or delivery orders. */
  fulfillmentType: z.enum(['pickup', 'delivery']).optional(),
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
  sellingKobo?: number;
  valueKobo: number;
}

export interface ConsumptionReportDto {
  from: string;
  to: string;
  totalUnits: number;
  totalValueKobo: number;
  rows: ConsumptionRow[];
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
