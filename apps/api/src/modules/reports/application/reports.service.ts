import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ALL_BRANCHES,
  OrderPaymentStatus,
  ReportRangeQuery,
  SalesSummaryDto,
} from '@lanyard/contracts';

import { Order } from '../../order/infrastructure/order.schema';

/** Minimal order shape the pure aggregator needs (plain data — no Mongoose). */
export interface OrderForReport {
  createdAt: Date | string;
  requiresRxVerification: boolean;
  payment: { status: string };
  totals: { totalKobo: number };
  items: Array<{ productId: string; name: string; quantity: number; lineTotalKobo: number }>;
}

function dayKey(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function eachDay(from: Date, to: Date): string[] {
  const days: string[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  // Guard against an inverted or absurd range producing an unbounded loop.
  let guard = 0;
  while (cursor <= end && guard < 366) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
  }
  return days;
}

/**
 * Pure sales aggregation over a set of orders. Revenue counts only PAID orders;
 * refunds are reported separately. Exported for unit testing without a database.
 */
export function summarizeSales(
  orders: OrderForReport[],
  from: Date,
  to: Date,
  topN = 5,
): SalesSummaryDto {
  const paid = orders.filter((o) => o.payment?.status === OrderPaymentStatus.PAID);
  const refunded = orders.filter((o) => o.payment?.status === OrderPaymentStatus.REFUNDED);

  const revenueKobo = paid.reduce((sum, o) => sum + (o.totals?.totalKobo ?? 0), 0);
  const refundedKobo = refunded.reduce((sum, o) => sum + (o.totals?.totalKobo ?? 0), 0);
  const rxOrders = paid.filter((o) => o.requiresRxVerification).length;

  const dayBuckets = new Map<string, { revenueKobo: number; orders: number }>();
  for (const day of eachDay(from, to)) dayBuckets.set(day, { revenueKobo: 0, orders: 0 });
  for (const o of paid) {
    const bucket = dayBuckets.get(dayKey(o.createdAt));
    if (bucket) {
      bucket.revenueKobo += o.totals?.totalKobo ?? 0;
      bucket.orders += 1;
    }
  }

  const productAgg = new Map<string, { name: string; quantity: number; revenueKobo: number }>();
  for (const o of paid) {
    for (const item of o.items ?? []) {
      const key = String(item.productId);
      const entry = productAgg.get(key) ?? { name: item.name, quantity: 0, revenueKobo: 0 };
      entry.quantity += item.quantity ?? 0;
      entry.revenueKobo += item.lineTotalKobo ?? 0;
      productAgg.set(key, entry);
    }
  }
  const topProducts = [...productAgg.entries()]
    .map(([productId, v]) => ({ productId, ...v }))
    .sort((a, b) => b.revenueKobo - a.revenueKobo)
    .slice(0, topN);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    paidOrders: paid.length,
    revenueKobo,
    aovKobo: paid.length > 0 ? Math.round(revenueKobo / paid.length) : 0,
    rxOrders,
    otcOrders: paid.length - rxOrders,
    refunds: refunded.length,
    refundedKobo,
    byDay: [...dayBuckets.entries()].map(([date, v]) => ({ date, ...v })),
    topProducts,
  };
}

const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 366;

@Injectable()
export class ReportsService {
  constructor(@InjectModel(Order.name) private readonly orderModel: Model<Order>) {}

  async salesSummary(branchScope: string[], range: ReportRangeQuery): Promise<SalesSummaryDto> {
    const to = range.to ?? new Date();
    const from = range.from ?? new Date(to.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    // Clamp the window so an over-wide range can't pull an unbounded result set.
    const clampedFrom = new Date(
      Math.max(from.getTime(), to.getTime() - MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000),
    );

    const filter: Record<string, unknown> = { createdAt: { $gte: clampedFrom, $lte: to } };
    if (!branchScope.includes(ALL_BRANCHES)) {
      filter.branchId = { $in: branchScope.map((id) => new Types.ObjectId(id)) };
    }

    const orders = await this.orderModel
      .find(filter)
      .select('createdAt requiresRxVerification payment.status totals.totalKobo items')
      .lean<OrderForReport[]>();

    return summarizeSales(orders, clampedFrom, to);
  }
}
