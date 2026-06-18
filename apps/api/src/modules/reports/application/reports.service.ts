import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ALL_BRANCHES,
  ConsumptionReportDto,
  ConsumptionRow,
  InventoryValuationDto,
  InventoryValuationQuery,
  InventoryValuationRow,
  OrderPaymentStatus,
  ReportRangeQuery,
  SalesSummaryDto,
  StockMovementType,
} from '@lanyard/contracts';

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
  agg: Array<{ productId: string; unitsDispensed: number; movements: number }>,
  productById: Map<string, ValuationProduct>,
  priceByProduct: Map<string, number | undefined>,
  from: Date,
  to: Date,
): ConsumptionReportDto {
  const rows: ConsumptionRow[] = agg
    .map((a) => {
      const product = productById.get(a.productId);
      const sellingKobo = priceByProduct.get(a.productId);
      return {
        productId: a.productId,
        name: product?.name ?? 'Unknown product',
        sku: product?.sku,
        genericName: product?.genericName,
        brand: product?.brand,
        form: product?.form,
        unitsDispensed: a.unitsDispensed,
        movements: a.movements,
        sellingKobo,
        valueKobo: a.unitsDispensed * (sellingKobo ?? 0),
      };
    })
    .sort((a, b) => b.unitsDispensed - a.unitsDispensed);

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    totalUnits: rows.reduce((sum, r) => sum + r.unitsDispensed, 0),
    totalValueKobo: rows.reduce((sum, r) => sum + r.valueKobo, 0),
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
      _id: Types.ObjectId;
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
          _id: '$productId',
          unitsDispensed: { $sum: { $abs: '$quantity' } },
          movements: { $sum: 1 },
        },
      },
    ]);

    const rows = agg.map((a) => ({
      productId: a._id.toString(),
      unitsDispensed: a.unitsDispensed,
      movements: a.movements,
    }));
    const productById = await this.loadProducts(rows.map((r) => r.productId));
    const priceByProduct = await this.loadSellingByProduct(
      branchScope,
      range.branchId,
      rows.map((r) => r.productId),
    );

    return buildConsumption(rows, productById, priceByProduct, clampedFrom, to);
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

  /** Selling price per product (best-effort within scope) for consumption valuation. */
  private async loadSellingByProduct(
    branchScope: string[],
    branchId: string | undefined,
    productIds: string[],
  ): Promise<Map<string, number | undefined>> {
    const unique = [...new Set(productIds)];
    if (unique.length === 0) return new Map();
    const prices = await this.priceModel
      .find({
        ...this.branchFilter(branchScope, branchId),
        productId: { $in: unique.map((id) => new Types.ObjectId(id)) },
      })
      .select('productId priceKobo')
      .lean<Array<{ productId: Types.ObjectId; priceKobo?: number }>>();
    const map = new Map<string, number | undefined>();
    for (const p of prices) map.set(p.productId.toString(), p.priceKobo);
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
      'Selling (NGN)': naira(r.sellingKobo),
      'Consumption value (NGN)': naira(r.valueKobo),
    }));
    return toSpreadsheet(records, {
      sheetName: 'Consumption',
      filenameBase: 'consumption',
      format,
    });
  }
}
