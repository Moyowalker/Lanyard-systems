import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ALL_BRANCHES,
  ConsumptionReportDto,
  ConsumptionRow,
  ExpiringReportDto,
  ExpiringReportQuery,
  ExpiringRow,
  ExpiryBand,
  InventoryValuationDto,
  InventoryValuationQuery,
  InventoryValuationRow,
  LowStockQuery,
  LowStockReportDto,
  LowStockRow,
  OrderPaymentStatus,
  PaymentChannelBreakdownRow,
  ReportRangeQuery,
  SalesSummaryDto,
  StockMovementType,
} from '@lanyard/contracts';

import { Branch } from '../../branch/infrastructure/branch.schema';
import { Order } from '../../order/infrastructure/order.schema';
import { InventoryItem, StockMovement } from '../../inventory/infrastructure/inventory.schemas';
import { Product } from '../../catalog/infrastructure/catalog.schemas';
import { PriceList } from '../../pricing/infrastructure/price-list.schema';
import {
  SpreadsheetFile,
  SpreadsheetFormat,
  toSpreadsheet,
} from '../../../core/export/spreadsheet';

/** Kobo → naira, rounded to 2dp, for human-readable spreadsheet money columns. */
function naira(kobo?: number): number {
  return Math.round(kobo ?? 0) / 100;
}

/** Minimal order shape the payment breakdown needs (plain data — no Mongoose). */
export interface OrderForPaymentBreakdown {
  totals: { totalKobo: number };
  payment?: { status?: string };
  counterSale?: {
    paymentChannel?: string;
    payments?: Array<{ channel: string; amountKobo: number }>;
    returns?: Array<{ refundKobo?: number }>;
  };
}

/**
 * Revenue grouped by payment channel, net of refunds.
 *
 * Counter sales report their till channels — a split contributes to each channel it used.
 * Online orders bucket as 'online'. Refunds reduce each tender in proportion to its share of
 * the sale, so a partially-returned counter sale nets down rather than showing full value.
 */
export function buildPaymentBreakdown(
  orders: OrderForPaymentBreakdown[],
): PaymentChannelBreakdownRow[] {
  const buckets = new Map<string, { totalKobo: number; orders: number }>();
  const add = (channel: string, amountKobo: number, countOrder: boolean) => {
    const bucket = buckets.get(channel) ?? { totalKobo: 0, orders: 0 };
    bucket.totalKobo += amountKobo;
    if (countOrder) bucket.orders += 1;
    buckets.set(channel, bucket);
  };

  for (const order of orders) {
    const counter = order.counterSale;
    const orderTotal = order.totals?.totalKobo ?? 0;

    // Tender lines: the split when present, otherwise the whole sale on its primary channel.
    const lines = counter?.payments?.length
      ? counter.payments.map((p) => ({ channel: p.channel, amountKobo: p.amountKobo }))
      : [{ channel: counter?.paymentChannel ?? 'online', amountKobo: orderTotal }];

    const returned = (counter?.returns ?? []).reduce((sum, r) => sum + (r.refundKobo ?? 0), 0);
    // An order marked REFUNDED with no itemised returns was reversed in full.
    const refundedKobo =
      returned > 0
        ? Math.min(returned, orderTotal)
        : order.payment?.status === OrderPaymentStatus.REFUNDED
          ? orderTotal
          : 0;

    const gross = lines.reduce((sum, l) => sum + l.amountKobo, 0) || 1;
    // Each DISTINCT channel counts the order once — previously only the first split line did,
    // so an HMO+cash sale showed as 1 cash order and 0 HMO orders.
    const counted = new Set<string>();
    for (const line of lines) {
      const net = line.amountKobo - Math.round(refundedKobo * (line.amountKobo / gross));
      add(line.channel, net, !counted.has(line.channel));
      counted.add(line.channel);
    }
  }

  return [...buckets.entries()]
    .map(([channel, bucket]) => ({ channel, ...bucket }))
    .sort((a, b) => b.totalKobo - a.totalKobo);
}

/** Human labels for exported payment channels — mirrors the console's CHANNEL_LABEL. */
const CHANNEL_EXPORT_LABEL: Record<string, string> = {
  cash: 'Cash',
  pos_terminal: 'Card (terminal)',
  card: 'Card',
  bank_transfer: 'Bank transfer',
  ussd: 'USSD',
  hmo: 'HMO',
  online: 'Online',
};

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

/** Minimal inputs the pure valuation builder needs (no Mongoose). */
export interface ValuationItem {
  productId: string;
  branchId: string;
  onHand: number;
  reserved: number;
}
export interface ValuationProduct {
  name?: string;
  sku?: string;
  genericName?: string;
  brand?: string;
  form?: string;
}
export interface PricePair {
  costKobo?: number;
  priceKobo?: number;
}

export interface ConsumptionAggregate {
  productId: string;
  branchId?: string;
  unitsDispensed: number;
  movements: number;
}

/** Pure inventory valuation: stock at cost and selling price, plus totals. Exported for tests. */
export function buildInventoryValuation(
  items: ValuationItem[],
  productById: Map<string, ValuationProduct>,
  priceByKey: Map<string, PricePair>,
): InventoryValuationDto {
  const rows: InventoryValuationRow[] = items
    .map((it) => {
      const product = productById.get(it.productId);
      const price = priceByKey.get(`${it.branchId}:${it.productId}`);
      const onHand = it.onHand ?? 0;
      const costKobo = price?.costKobo;
      const sellingKobo = price?.priceKobo;
      return {
        productId: it.productId,
        name: product?.name ?? 'Unknown product',
        sku: product?.sku,
        genericName: product?.genericName,
        brand: product?.brand,
        form: product?.form,
        onHand,
        available: Math.max(0, onHand - (it.reserved ?? 0)),
        costKobo,
        sellingKobo,
        stockCostKobo: onHand * (costKobo ?? 0),
        stockSellingKobo: onHand * (sellingKobo ?? 0),
      };
    })
    .sort((a, b) => b.stockSellingKobo - a.stockSellingKobo);

  return {
    generatedAt: new Date().toISOString(),
    totalDrugs: new Set(items.map((i) => i.productId)).size,
    totalQuantity: rows.reduce((sum, r) => sum + r.onHand, 0),
    totalCostKobo: rows.reduce((sum, r) => sum + r.stockCostKobo, 0),
    totalSellingKobo: rows.reduce((sum, r) => sum + r.stockSellingKobo, 0),
    rows,
  };
}

/** Pure consumption report from a dispense aggregation. Exported for tests. */
export function buildConsumption(
  agg: ConsumptionAggregate[],
  productById: Map<string, ValuationProduct>,
  priceByKey: Map<string, PricePair>,
  from: Date,
  to: Date,
  paymentBreakdown: PaymentChannelBreakdownRow[] = [],
): ConsumptionReportDto {
  const combined = new Map<
    string,
    {
      unitsDispensed: number;
      movements: number;
      valueKobo: number;
      valueAtCostKobo: number;
      hasSellingPrice: boolean;
      hasCompleteCost: boolean;
    }
  >();

  for (const item of agg) {
    const priceKey = item.branchId ? `${item.branchId}:${item.productId}` : item.productId;
    const price = priceByKey.get(priceKey);
    const current = combined.get(item.productId) ?? {
      unitsDispensed: 0,
      movements: 0,
      valueKobo: 0,
      valueAtCostKobo: 0,
      hasSellingPrice: false,
      hasCompleteCost: true,
    };
    current.unitsDispensed += item.unitsDispensed;
    current.movements += item.movements;
    current.valueKobo += item.unitsDispensed * (price?.priceKobo ?? 0);
    current.hasSellingPrice ||= price?.priceKobo != null;
    if (price?.costKobo == null) {
      current.hasCompleteCost = false;
    } else {
      current.valueAtCostKobo += item.unitsDispensed * price.costKobo;
    }
    combined.set(item.productId, current);
  }

  const rows: ConsumptionRow[] = [...combined.entries()]
    .map(([productId, values]) => {
      const product = productById.get(productId);
      const sellingKobo =
        values.hasSellingPrice && values.unitsDispensed > 0
          ? Math.round(values.valueKobo / values.unitsDispensed)
          : undefined;
      const costKobo =
        values.hasCompleteCost && values.unitsDispensed > 0
          ? Math.round(values.valueAtCostKobo / values.unitsDispensed)
          : undefined;
      const valueAtCostKobo = values.hasCompleteCost ? values.valueAtCostKobo : undefined;
      return {
        productId,
        name: product?.name ?? 'Unknown product',
        sku: product?.sku,
        genericName: product?.genericName,
        brand: product?.brand,
        form: product?.form,
        unitsDispensed: values.unitsDispensed,
        movements: values.movements,
        costKobo,
        sellingKobo,
        valueKobo: values.valueKobo,
        valueAtCostKobo,
        marginKobo: valueAtCostKobo != null ? values.valueKobo - valueAtCostKobo : undefined,
      };
    })
    .sort((a, b) => b.unitsDispensed - a.unitsDispensed);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    totalUnits: rows.reduce((sum, r) => sum + r.unitsDispensed, 0),
    totalValueKobo: rows.reduce((sum, r) => sum + r.valueKobo, 0),
    totalValueAtCostKobo: rows.reduce((sum, r) => sum + (r.valueAtCostKobo ?? 0), 0),
    totalMarginKobo: rows.reduce((sum, r) => sum + (r.marginKobo ?? 0), 0),
    rows,
    paymentBreakdown,
  };
}

/** Same threshold as InventoryService: a row is low once available ≤ max(1, reorderLevel). */
function lowStockThreshold(reorderLevel: number): number {
  return Math.max(1, reorderLevel);
}

/** Minimal stock item both stock reports consume (no Mongoose). */
export interface StockReportItem {
  productId: string;
  branchId: string;
  onHand: number;
  reserved: number;
  reorderLevel: number;
  batches: Array<{ expiry?: Date | string }>;
}

/** Pure low-stock report: items at/below their reorder threshold. Exported for tests. */
export function buildLowStock(
  items: StockReportItem[],
  productById: Map<string, ValuationProduct>,
  branchNameById: Map<string, string>,
): LowStockReportDto {
  const rows: LowStockRow[] = items
    .map((item) => {
      const available = Math.max(0, item.onHand - item.reserved);
      return { item, available };
    })
    .filter(({ item, available }) => available <= lowStockThreshold(item.reorderLevel))
    .map(({ item, available }) => {
      const product = productById.get(item.productId);
      return {
        productId: item.productId,
        productName: product?.name ?? 'Unknown product',
        genericName: product?.genericName,
        brand: product?.brand,
        form: product?.form,
        branchId: item.branchId,
        branchName: branchNameById.get(item.branchId) ?? 'Unknown branch',
        onHand: item.onHand,
        reserved: item.reserved,
        available,
        reorderLevel: item.reorderLevel,
        status: (available <= 0 ? 'out' : 'low') as LowStockRow['status'],
      };
    })
    .sort((a, b) => a.available - b.available || a.productName.localeCompare(b.productName));

  return {
    generatedAt: new Date().toISOString(),
    totalItems: rows.length,
    outOfStock: rows.filter((row) => row.status === 'out').length,
    rows,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Red band: 6 months or less to expiry (client-confirmed banding). */
const RED_BAND_DAYS = 180;

/**
 * Pure expiring-drugs report. Horizon defaults to 9 months; banding is the single
 * source of truth shared by UI and exports: expired ≤ 0d, red ≤ 180d, yellow ≤ horizon.
 * Exported for tests.
 */
export function buildExpiring(
  items: StockReportItem[],
  productById: Map<string, ValuationProduct>,
  branchNameById: Map<string, string>,
  horizonDays: number,
  now = new Date(),
): ExpiringReportDto {
  const cutoff = now.getTime() + horizonDays * DAY_MS;

  const rows: ExpiringRow[] = items
    .map((item) => {
      const soonest = item.batches
        .map((batch) => (batch.expiry ? new Date(batch.expiry).getTime() : Number.NaN))
        .filter((time) => Number.isFinite(time))
        .sort((a, b) => a - b)[0];
      return { item, soonest };
    })
    .filter(({ item, soonest }) => item.onHand > 0 && soonest !== undefined && soonest! <= cutoff)
    .map(({ item, soonest }) => {
      const product = productById.get(item.productId);
      const daysLeft = Math.ceil((soonest! - now.getTime()) / DAY_MS);
      const band: ExpiryBand =
        daysLeft <= 0 ? 'expired' : daysLeft <= RED_BAND_DAYS ? 'red' : 'yellow';
      return {
        productId: item.productId,
        productName: product?.name ?? 'Unknown product',
        genericName: product?.genericName,
        brand: product?.brand,
        form: product?.form,
        branchId: item.branchId,
        branchName: branchNameById.get(item.branchId) ?? 'Unknown branch',
        onHand: item.onHand,
        batchCount: item.batches.length,
        nextExpiry: new Date(soonest!).toISOString(),
        daysLeft,
        band,
      };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft || a.productName.localeCompare(b.productName));

  return {
    generatedAt: now.toISOString(),
    horizonDays,
    expired: rows.filter((row) => row.band === 'expired').length,
    red: rows.filter((row) => row.band === 'red').length,
    yellow: rows.filter((row) => row.band === 'yellow').length,
    rows,
  };
}

const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 366;

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(InventoryItem.name) private readonly inventoryModel: Model<InventoryItem>,
    @InjectModel(StockMovement.name) private readonly movementModel: Model<StockMovement>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    @InjectModel(PriceList.name) private readonly priceModel: Model<PriceList>,
    @InjectModel(Branch.name) private readonly branchModel: Model<Branch>,
  ) {}

  async salesSummary(branchScope: string[], range: ReportRangeQuery): Promise<SalesSummaryDto> {
    const to = range.to ?? new Date();
    const from = range.from ?? new Date(to.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    // Clamp the window so an over-wide range can't pull an unbounded result set.
    const clampedFrom = new Date(
      Math.max(from.getTime(), to.getTime() - MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000),
    );

    const filter: Record<string, unknown> = {
      createdAt: { $gte: clampedFrom, $lte: to },
      ...this.branchFilter(branchScope, range.branchId),
    };
    if (range.fulfillmentType) {
      filter['fulfillment.type'] = range.fulfillmentType;
    }

    const orders = await this.orderModel
      .find(filter)
      .select('createdAt requiresRxVerification payment.status totals.totalKobo items')
      .lean<OrderForReport[]>();

    return summarizeSales(orders, clampedFrom, to);
  }

  /** Point-in-time stock valued at cost and selling price, branch-scoped. */
  async inventoryValuation(
    branchScope: string[],
    query: InventoryValuationQuery,
  ): Promise<InventoryValuationDto> {
    const match = this.branchFilter(branchScope, query.branchId);
    const items = await this.inventoryModel
      .find(match)
      .select('productId branchId onHand reserved')
      .lean<
        Array<{
          productId: Types.ObjectId;
          branchId: Types.ObjectId;
          onHand?: number;
          reserved?: number;
        }>
      >();

    const valuationItems: ValuationItem[] = items.map((i) => ({
      productId: i.productId.toString(),
      branchId: i.branchId.toString(),
      onHand: i.onHand ?? 0,
      reserved: i.reserved ?? 0,
    }));
    const productById = await this.loadProducts(valuationItems.map((i) => i.productId));
    const priceByKey = await this.loadPricesByKey(items);

    return buildInventoryValuation(valuationItems, productById, priceByKey);
  }

  /** Units dispensed per drug over a window (the append-only DISPENSE ledger). */
  async consumption(branchScope: string[], range: ReportRangeQuery): Promise<ConsumptionReportDto> {
    const to = range.to ?? new Date();
    const from = range.from ?? new Date(to.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const clampedFrom = new Date(
      Math.max(from.getTime(), to.getTime() - MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000),
    );

    const agg = await this.movementModel.aggregate<{
      _id: { productId: Types.ObjectId; branchId: Types.ObjectId };
      unitsDispensed: number;
      movements: number;
    }>([
      {
        $match: {
          type: StockMovementType.DISPENSE,
          createdAt: { $gte: clampedFrom, $lte: to },
          ...this.branchFilter(branchScope, range.branchId),
        },
      },
      {
        $group: {
          _id: { productId: '$productId', branchId: '$branchId' },
          unitsDispensed: { $sum: { $abs: '$quantity' } },
          movements: { $sum: 1 },
        },
      },
    ]);

    const rows = agg.map((a) => ({
      productId: a._id.productId.toString(),
      branchId: a._id.branchId.toString(),
      unitsDispensed: a.unitsDispensed,
      movements: a.movements,
    }));
    const [productById, priceByKey, paymentBreakdown] = await Promise.all([
      this.loadProducts(rows.map((r) => r.productId)),
      this.loadConsumptionPrices(rows),
      this.paymentBreakdown(branchScope, range.branchId, clampedFrom, to),
    ]);

    return buildConsumption(rows, productById, priceByKey, clampedFrom, to, paymentBreakdown);
  }

  /**
   * Revenue in the window grouped by payment channel. Counter sales report their
   * till channels (split payments count each entry); online orders bucket as 'online'.
   */
  private async paymentBreakdown(
    branchScope: string[],
    branchId: string | undefined,
    from: Date,
    to: Date,
  ): Promise<PaymentChannelBreakdownRow[]> {
    const orders = await this.orderModel
      .find({
        createdAt: { $gte: from, $lte: to },
        // REFUNDED orders are included so their reversal can be netted out. Filtering to PAID
        // alone silently dropped them, which overstated takings.
        'payment.status': {
          $in: [OrderPaymentStatus.PAID, OrderPaymentStatus.REFUNDED],
        },
        ...this.branchFilter(branchScope, branchId),
      })
      .select(
        'totals.totalKobo payment.status counterSale.paymentChannel counterSale.payments counterSale.returns',
      )
      .lean<OrderForPaymentBreakdown[]>();

    return buildPaymentBreakdown(orders);
  }

  /** Items at/below their reorder threshold across the caller's branch scope. */
  async lowStock(branchScope: string[], query: LowStockQuery): Promise<LowStockReportDto> {
    const items = await this.loadStockItems(branchScope, query.branchId);
    const [productById, branchNameById] = await Promise.all([
      this.loadProducts(items.map((item) => item.productId)),
      this.loadBranchNames(items.map((item) => item.branchId)),
    ]);
    return buildLowStock(items, productById, branchNameById);
  }

  /** Drugs whose soonest batch expires within the horizon (default 9 months). */
  async expiring(branchScope: string[], query: ExpiringReportQuery): Promise<ExpiringReportDto> {
    const items = await this.loadStockItems(branchScope, query.branchId);
    const [productById, branchNameById] = await Promise.all([
      this.loadProducts(items.map((item) => item.productId)),
      this.loadBranchNames(items.map((item) => item.branchId)),
    ]);
    return buildExpiring(items, productById, branchNameById, query.days);
  }

  async exportLowStock(
    branchScope: string[],
    query: LowStockQuery,
    format: SpreadsheetFormat,
  ): Promise<SpreadsheetFile> {
    const report = await this.lowStock(branchScope, query);
    const records = report.rows.map((r) => ({
      Product: r.productName,
      Generic: r.genericName ?? '',
      Brand: r.brand ?? '',
      Form: r.form ?? '',
      Branch: r.branchName,
      'On hand': r.onHand,
      Reserved: r.reserved,
      Available: r.available,
      'Reorder level': r.reorderLevel,
      Status: r.status === 'out' ? 'Out of stock' : 'Low stock',
    }));
    return toSpreadsheet(records, {
      sheetName: 'Low stock',
      filenameBase: 'low-stock',
      format,
    });
  }

  async exportExpiring(
    branchScope: string[],
    query: ExpiringReportQuery,
    format: SpreadsheetFormat,
  ): Promise<SpreadsheetFile> {
    const report = await this.expiring(branchScope, query);
    const records = report.rows.map((r) => ({
      Product: r.productName,
      Generic: r.genericName ?? '',
      Brand: r.brand ?? '',
      Form: r.form ?? '',
      Branch: r.branchName,
      'On hand': r.onHand,
      Batches: r.batchCount,
      'Next expiry': r.nextExpiry.slice(0, 10),
      'Days left': r.daysLeft,
      Band:
        r.band === 'expired'
          ? 'EXPIRED'
          : r.band === 'red'
            ? 'Red (≤6 months)'
            : 'Yellow (6–9 months)',
    }));
    return toSpreadsheet(records, {
      sheetName: 'Expiring drugs',
      filenameBase: 'expiring-drugs',
      format,
    });
  }

  /** Stock rows (with batches) for the low-stock/expiring reports, branch-scoped. */
  private async loadStockItems(
    branchScope: string[],
    branchId?: string,
  ): Promise<StockReportItem[]> {
    const rows = await this.inventoryModel
      .find(this.branchFilter(branchScope, branchId))
      .select('productId branchId onHand reserved reorderLevel batches')
      .lean<
        Array<{
          productId: Types.ObjectId;
          branchId: Types.ObjectId;
          onHand?: number;
          reserved?: number;
          reorderLevel?: number;
          batches?: Array<{ expiry?: Date }>;
        }>
      >();
    return rows.map((row) => ({
      productId: row.productId.toString(),
      branchId: row.branchId.toString(),
      onHand: row.onHand ?? 0,
      reserved: row.reserved ?? 0,
      reorderLevel: row.reorderLevel ?? 0,
      batches: row.batches ?? [],
    }));
  }

  private async loadBranchNames(branchIds: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(branchIds)];
    if (unique.length === 0) return new Map();
    const branches = await this.branchModel
      .find({ _id: { $in: unique.map((id) => new Types.ObjectId(id)) } })
      .select('name')
      .lean<Array<{ _id: Types.ObjectId; name?: string }>>();
    return new Map(branches.map((b) => [b._id.toString(), b.name ?? 'Unknown branch']));
  }

  /* ── shared helpers ── */

  /** Branch filter fragment that never widens the caller's scope. */
  private branchFilter(branchScope: string[], branchId?: string): Record<string, unknown> {
    const scopeAll = branchScope.includes(ALL_BRANCHES);
    if (branchId) {
      return {
        branchId:
          scopeAll || branchScope.includes(branchId)
            ? new Types.ObjectId(branchId)
            : new Types.ObjectId('000000000000000000000000'), // out of scope → no data
      };
    }
    if (!scopeAll) {
      return { branchId: { $in: branchScope.map((id) => new Types.ObjectId(id)) } };
    }
    return {};
  }

  private async loadProducts(productIds: string[]): Promise<Map<string, ValuationProduct>> {
    const unique = [...new Set(productIds)];
    if (unique.length === 0) return new Map();
    const products = await this.productModel
      .find({ _id: { $in: unique.map((id) => new Types.ObjectId(id)) } })
      .select('name sku genericName brand form')
      .lean<
        Array<{
          _id: Types.ObjectId;
          name?: string;
          sku?: string;
          genericName?: string;
          brand?: string;
          form?: string;
        }>
      >();
    return new Map(
      products.map((p) => [
        p._id.toString(),
        { name: p.name, sku: p.sku, genericName: p.genericName, brand: p.brand, form: p.form },
      ]),
    );
  }

  /** Price pairs keyed by `${branchId}:${productId}` for valuation across branches. */
  private async loadPricesByKey(
    items: Array<{ productId: Types.ObjectId; branchId: Types.ObjectId }>,
  ): Promise<Map<string, PricePair>> {
    if (items.length === 0) return new Map();
    const branchIds = [...new Set(items.map((i) => i.branchId.toString()))];
    const productIds = [...new Set(items.map((i) => i.productId.toString()))];
    const prices = await this.priceModel
      .find({
        branchId: { $in: branchIds.map((id) => new Types.ObjectId(id)) },
        productId: { $in: productIds.map((id) => new Types.ObjectId(id)) },
      })
      .select('branchId productId priceKobo costKobo')
      .lean<
        Array<{
          branchId: Types.ObjectId;
          productId: Types.ObjectId;
          priceKobo?: number;
          costKobo?: number;
        }>
      >();
    return new Map(
      prices.map((p) => [
        `${p.branchId.toString()}:${p.productId.toString()}`,
        { priceKobo: p.priceKobo, costKobo: p.costKobo },
      ]),
    );
  }

  /** Branch-specific prices for consumption valuation across one or many branches. */
  private async loadConsumptionPrices(
    items: Array<{ branchId: string; productId: string }>,
  ): Promise<Map<string, PricePair>> {
    if (items.length === 0) return new Map();
    const branchIds = [...new Set(items.map((item) => item.branchId))];
    const productIds = [...new Set(items.map((item) => item.productId))];
    const prices = await this.priceModel
      .find({
        branchId: { $in: branchIds.map((id) => new Types.ObjectId(id)) },
        productId: { $in: productIds.map((id) => new Types.ObjectId(id)) },
      })
      .select('branchId productId priceKobo costKobo')
      .lean<
        Array<{
          branchId: Types.ObjectId;
          productId: Types.ObjectId;
          priceKobo?: number;
          costKobo?: number;
        }>
      >();
    const map = new Map<string, PricePair>();
    for (const p of prices) {
      map.set(`${p.branchId.toString()}:${p.productId.toString()}`, {
        priceKobo: p.priceKobo,
        costKobo: p.costKobo,
      });
    }
    return map;
  }

  /* ── exports ── */

  async exportSalesSummary(
    branchScope: string[],
    range: ReportRangeQuery,
    format: SpreadsheetFormat,
  ): Promise<SpreadsheetFile> {
    const report = await this.salesSummary(branchScope, range);
    const records = report.byDay.map((d) => ({
      Date: d.date,
      Orders: d.orders,
      'Revenue (NGN)': naira(d.revenueKobo),
    }));
    return toSpreadsheet(records, {
      sheetName: 'Sales',
      filenameBase: 'sales-summary',
      format,
    });
  }

  async exportInventoryValuation(
    branchScope: string[],
    query: InventoryValuationQuery,
    format: SpreadsheetFormat,
  ): Promise<SpreadsheetFile> {
    const report = await this.inventoryValuation(branchScope, query);
    const records = report.rows.map((r) => ({
      Product: r.name,
      SKU: r.sku ?? '',
      Generic: r.genericName ?? '',
      Brand: r.brand ?? '',
      Form: r.form ?? '',
      'On hand': r.onHand,
      Available: r.available,
      'Cost (NGN)': naira(r.costKobo),
      'Selling (NGN)': naira(r.sellingKobo),
      'Stock cost (NGN)': naira(r.stockCostKobo),
      'Stock selling (NGN)': naira(r.stockSellingKobo),
    }));
    return toSpreadsheet(records, {
      sheetName: 'Inventory valuation',
      filenameBase: 'inventory-valuation',
      format,
    });
  }

  async exportConsumption(
    branchScope: string[],
    range: ReportRangeQuery,
    format: SpreadsheetFormat,
  ): Promise<SpreadsheetFile> {
    const report = await this.consumption(branchScope, range);
    const records = report.rows.map((r) => ({
      Product: r.name,
      SKU: r.sku ?? '',
      Generic: r.genericName ?? '',
      Brand: r.brand ?? '',
      Form: r.form ?? '',
      'Units dispensed': r.unitsDispensed,
      Movements: r.movements,
      'Cost (NGN)': r.costKobo != null ? naira(r.costKobo) : '',
      'Selling (NGN)': naira(r.sellingKobo),
      'Consumption value (NGN)': naira(r.valueKobo),
      'Value at cost (NGN)': r.valueAtCostKobo != null ? naira(r.valueAtCostKobo) : '',
      'Margin (NGN)': r.marginKobo != null ? naira(r.marginKobo) : '',
    }));

    // The payment breakdown is shown on screen but used to be dropped from the download
    // entirely. Append it below the drug rows under its OWN columns (json_to_sheet unions the
    // keys across rows, so these stay blank for the drug rows) rather than overloading the
    // product columns, which would misread.
    const paymentRows = report.paymentBreakdown.map((row) => ({
      'Payment method': CHANNEL_EXPORT_LABEL[row.channel] ?? row.channel,
      'Payment orders': row.orders,
      'Payment total (NGN)': naira(row.totalKobo),
    }));

    return toSpreadsheet([...records, ...(paymentRows.length > 0 ? [{}, ...paymentRows] : [])], {
      sheetName: 'Consumption',
      filenameBase: 'consumption',
      format,
    });
  }
}
