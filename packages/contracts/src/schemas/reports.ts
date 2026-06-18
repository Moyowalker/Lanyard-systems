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
