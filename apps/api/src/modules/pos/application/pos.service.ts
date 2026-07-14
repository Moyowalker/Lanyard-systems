import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ActorType,
  Currency,
  ErrorCode,
  FulfillmentType,
  OrderStatus,
  Paginated,
  PosCreateSaleInput,
  PosReturnInput,
  PosReturnResultDto,
  PosSaleDto,
  PosSalesQuery,
  ProductListItemDto,
  ProductListQuery,
  ProductStatus,
  RegulatoryClass,
  isQueryTrue,
} from '@lanyard/contracts';

import { Order, OrderDocument } from '../../order/infrastructure/order.schema';
import { Product } from '../../catalog/infrastructure/catalog.schemas';
import { StaffUser } from '../../identity/infrastructure/identity.schemas';
import { Customer } from '../../identity/infrastructure/identity.schemas';
import { CatalogService } from '../../catalog/application/catalog.service';
import { OrderService, Actor } from '../../order/application/order.service';
import { PaymentService } from '../../payment/application/payment.service';
import { RefundService } from '../../payment/application/refund.service';
import { InventoryService } from '../../inventory/application/inventory.service';
import { PricingService } from '../../pricing/application/pricing.service';
import { CustomerAuthService } from '../../identity/application/customer-auth.service';
import { AuditService } from '../../../core/platform/audit.service';
import { TransactionService } from '../../../core/platform/transaction.service';
import { DomainError } from '../../../core/errors/domain-error';
import { AuthPrincipal } from '../../../core/auth/principal';

/** Distinct, defined ObjectIds — for a single batched `$in` lookup. */
function uniqueIds(ids: Array<Types.ObjectId | undefined>): Types.ObjectId[] {
  const seen = new Set<string>();
  const out: Types.ObjectId[] = [];
  for (const id of ids) {
    if (!id) continue;
    const key = id.toString();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(id);
    }
  }
  return out;
}

/**
 * Point-of-sale counter sales. A sale is a REAL order (fulfillment type "counter")
 * that is created, paid offline, and completed — stock reserved then dispensed — in
 * one transaction. Because it lands as a paid order with DISPENSE movements, it flows
 * into the same inventory ledger, sales reports, and consumption reports as online
 * orders: one centralized system.
 */
@Injectable()
export class PosService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    @InjectModel(StaffUser.name) private readonly staffModel: Model<StaffUser>,
    @InjectModel(Customer.name) private readonly customerModel: Model<Customer>,
    private readonly catalog: CatalogService,
    private readonly orders: OrderService,
    private readonly payments: PaymentService,
    private readonly refunds: RefundService,
    private readonly inventory: InventoryService,
    private readonly pricing: PricingService,
    private readonly customers: CustomerAuthService,
    private readonly audit: AuditService,
    private readonly tx: TransactionService,
  ) {}

  /**
   * Staff product lookup for the till — includes products hidden from the storefront
   * (`isAvailable: false`), since that flag is storefront-only visibility.
   */
  async listProducts(
    principal: AuthPrincipal,
    query: ProductListQuery,
  ): Promise<Paginated<ProductListItemDto>> {
    if (
      query.branchId &&
      !principal.branchScope.includes('ALL') &&
      !principal.branchScope.includes(query.branchId)
    ) {
      throw new DomainError(ErrorCode.BRANCH_SCOPE_VIOLATION, 'Outside your branch scope');
    }
    return this.catalog.listProductsForPos(query);
  }

  async createSale(principal: AuthPrincipal, input: PosCreateSaleInput): Promise<PosSaleDto> {
    // Idempotency: a retried submit returns the already-recorded sale.
    const existing = await this.orderModel.findOne({
      'counterSale.idempotencyKey': input.idempotencyKey,
    });
    if (existing) return this.hydrateOne(existing, principal);

    // ── validate products ──
    const productIds = input.items.map((i) => i.productId);
    const products = await this.productModel
      .find({ _id: { $in: productIds.map((id) => new Types.ObjectId(id)) } })
      .lean();
    const productById = new Map(products.map((p) => [p._id.toString(), p]));

    const problems: Array<{ field: string; issue: string }> = [];
    for (const item of input.items) {
      const product = productById.get(item.productId);
      if (!product || product.status !== ProductStatus.PUBLISHED) {
        problems.push({ field: item.productId, issue: 'Unknown or unpublished product' });
        continue;
      }
      if (product.regulatoryClass === RegulatoryClass.CONTROLLED) {
        problems.push({
          field: product.name,
          issue: 'Controlled substances cannot be sold at the counter',
        });
      }
    }
    if (problems.length > 0) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        'Sale contains unsellable items',
        problems,
      );
    }

    // POM gate: a paper prescription must be sighted and noted.
    const hasPom = input.items.some(
      (i) => productById.get(i.productId)?.regulatoryClass === RegulatoryClass.POM,
    );
    if (hasPom && !input.rxNote?.trim()) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        'This sale contains prescription-only medicine — record the sighted prescription (rxNote)',
        [{ field: 'rxNote', issue: 'required for prescription-only items' }],
      );
    }

    // ── price server-side from the branch price list ──
    // NB: `isAvailable` is a STOREFRONT visibility toggle, not a sales block — the
    // counter can sell any product that has a branch price (client feature: hide a
    // medicine online but keep it sellable at the POS).
    const priceMap = await this.pricing.getPriceMap(input.branchId, productIds);
    const unpriced = input.items.filter((i) => !priceMap.get(i.productId));
    if (unpriced.length > 0) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        'Some items have no active price at this branch',
        unpriced.map((i) => ({
          field: productById.get(i.productId)?.name ?? i.productId,
          issue: 'no branch price',
        })),
      );
    }

    // ── stock pre-check (fail fast with per-line shortfalls; the reserve inside the
    //    transaction is still the authoritative, race-safe check) ──
    const availability = await this.inventory.getAvailabilityMap(input.branchId, productIds);
    const short = input.items.filter((i) => (availability.get(i.productId) ?? 0) < i.quantity);
    if (short.length > 0) {
      throw new DomainError(
        ErrorCode.CONFLICT,
        'Insufficient stock for one or more items',
        short.map((i) => ({
          field: productById.get(i.productId)?.name ?? i.productId,
          issue: `only ${availability.get(i.productId) ?? 0} available`,
        })),
      );
    }

    // ── resolve the customer (linked by phone, or the shared walk-in placeholder) ──
    const customer = input.customer
      ? await this.customers.findOrCreateByPhone(input.customer.phone, input.customer)
      : await this.customers.findOrCreateWalkIn();

    const itemSnapshots = input.items.map((i) => {
      const product = productById.get(i.productId)!;
      const price = priceMap.get(i.productId)!;
      return {
        productId: new Types.ObjectId(i.productId),
        name: product.name,
        form: product.form,
        strength: product.strength,
        unitPriceKobo: price.priceKobo,
        quantity: i.quantity,
        lineTotalKobo: price.priceKobo * i.quantity,
        requiresPrescription: Boolean(product.requiresPrescription),
      };
    });
    const subtotalKobo = itemSnapshots.reduce((sum, s) => sum + s.lineTotalKobo, 0);

    // ── discount (percent of subtotal or fixed kobo), capped at the subtotal ──
    const discountKobo = input.discount
      ? Math.min(
          subtotalKobo,
          input.discount.type === 'percent'
            ? Math.round((subtotalKobo * input.discount.value) / 100)
            : Math.round(input.discount.value),
        )
      : 0;
    const totalKobo = subtotalKobo - discountKobo;

    // ── split payments must sum to the post-discount total exactly ──
    const paidKobo = input.payments.reduce((sum, p) => sum + p.amountKobo, 0);
    if (paidKobo !== totalKobo) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        `Payments must sum to the sale total (${totalKobo} kobo, got ${paidKobo})`,
        [{ field: 'payments', issue: 'amounts do not match the total' }],
      );
    }
    const primaryChannel = input.payments[0].channel;

    const actor: Actor = { id: principal.sub, role: principal.roles[0], type: ActorType.STAFF };
    const orderNo = this.orders.genOrderNo();

    let order: OrderDocument;
    try {
      order = await this.tx.run(async (session) => {
        const [created] = await this.orderModel.create(
          [
            {
              orderNo,
              customerId: customer._id,
              branchId: new Types.ObjectId(input.branchId),
              status: OrderStatus.AWAITING_PAYMENT,
              fulfillment: { type: FulfillmentType.COUNTER },
              items: itemSnapshots,
              requiresRxVerification: false, // paper Rx sighted at the counter; rxNote is the record
              totals: {
                subtotalKobo,
                discountKobo,
                deliveryKobo: 0,
                totalKobo,
                currency: Currency.NGN,
              },
              counterSale: {
                cashierStaffId: new Types.ObjectId(principal.sub),
                paymentChannel: primaryChannel,
                payments: input.payments,
                rxNote: input.rxNote?.trim() || undefined,
                idempotencyKey: input.idempotencyKey,
              },
            },
          ],
          { session },
        );

        // Record the offline payment → marks PAID and reserves stock. One intent for
        // the full amount under the primary channel; the split lives on counterSale.
        await this.payments.recordOfflinePayment(
          created._id.toString(),
          primaryChannel,
          principal.sub,
          session,
        );

        // markPaid routes stock shortfalls to STOCK_HOLD instead of failing — for a
        // counter sale the goods are physically present, so a shortfall means the
        // ledger disagrees with the shelf. Abort cleanly rather than complete.
        const paid = await this.orderModel.findById(created._id).session(session);
        if (!paid || paid.status !== OrderStatus.PAID) {
          throw new DomainError(
            ErrorCode.CONFLICT,
            'Stock changed while ringing up this sale — please re-check quantities',
          );
        }

        // Complete + dispense in the same transaction: goods leave over the counter.
        await this.orders.completeInSession(
          created._id.toString(),
          actor,
          'Counter sale completed at till',
          session,
        );

        await this.audit.record(
          {
            actorId: principal.sub,
            actorType: ActorType.STAFF,
            action: 'pos.sale',
            targetType: 'order',
            targetId: created._id.toString(),
            branchId: input.branchId,
            metadata: {
              orderNo,
              channels: input.payments.map((p) => p.channel),
              subtotalKobo,
              discountKobo,
              discount: input.discount,
              totalKobo,
              items: itemSnapshots.length,
              rxNote: Boolean(input.rxNote),
            },
          },
          session,
        );

        return created;
      });
    } catch (err) {
      // Concurrent duplicate submit: the other request won the unique index — return its sale.
      if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
        const winner = await this.orderModel.findOne({
          'counterSale.idempotencyKey': input.idempotencyKey,
        });
        if (winner) return this.hydrateOne(winner, principal);
      }
      throw err;
    }

    const fresh = await this.orderModel.findById(order._id);
    return this.hydrateOne(fresh ?? order, principal);
  }

  /**
   * Return part or all of a completed counter sale: refund settled at the till
   * (offline — no payment-provider call), goods booked back to stock with RETURN
   * movements, and the order moved to REFUNDED once everything is returned.
   * Refunds are proportional to any sale discount.
   */
  async returnSale(
    principal: AuthPrincipal,
    orderId: string,
    input: PosReturnInput,
  ): Promise<PosReturnResultDto> {
    const order = await this.orderModel.findById(orderId);
    if (!order) throw new DomainError(ErrorCode.NOT_FOUND, 'Sale not found');
    if (order.fulfillment.type !== FulfillmentType.COUNTER) {
      throw new DomainError(ErrorCode.CONFLICT, 'Only counter (POS) sales can be returned here');
    }
    if (
      !principal.branchScope.includes('ALL') &&
      !principal.branchScope.includes(order.branchId.toString())
    ) {
      throw new DomainError(ErrorCode.BRANCH_SCOPE_VIOLATION, 'Outside your branch scope');
    }
    if (order.status !== OrderStatus.COMPLETED) {
      throw new DomainError(
        ErrorCode.CONFLICT,
        `Sale is ${order.status} — only completed sales can be returned`,
      );
    }

    const soldByProduct = new Map(order.items.map((i) => [i.productId.toString(), i]));
    const returned = this.returnedByProduct(order) ?? {};

    // Requested lines; omitted items = everything still returnable.
    const requested: Array<{ productId: string; quantity: number }> =
      input.items ??
      [...soldByProduct.entries()]
        .map(([productId, item]) => ({
          productId,
          quantity: item.quantity - (returned[productId] ?? 0),
        }))
        .filter((line) => line.quantity > 0);

    if (requested.length === 0) {
      throw new DomainError(ErrorCode.CONFLICT, 'Nothing left to return on this sale');
    }

    const problems: Array<{ field: string; issue: string }> = [];
    for (const line of requested) {
      const sold = soldByProduct.get(line.productId);
      if (!sold) {
        problems.push({ field: line.productId, issue: 'not part of this sale' });
        continue;
      }
      const remaining = sold.quantity - (returned[line.productId] ?? 0);
      if (line.quantity > remaining) {
        problems.push({ field: sold.name, issue: `only ${remaining} returnable` });
      }
    }
    if (problems.length > 0) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Invalid return quantities', problems);
    }

    // Refund proportional to the sale discount; clamp so cumulative refunds never
    // exceed what was actually paid (rounding-safe on the final return).
    const subtotal = order.totals.subtotalKobo || 1;
    const discountFactor = 1 - (order.totals.discountKobo ?? 0) / subtotal;
    const grossKobo = requested.reduce((sum, line) => {
      const sold = soldByProduct.get(line.productId)!;
      return sum + sold.unitPriceKobo * line.quantity;
    }, 0);
    const alreadyRefunded = (order.counterSale?.returns ?? []).reduce(
      (sum, ret) => sum + (ret.refundKobo ?? 0),
      0,
    );
    const refundKobo = Math.min(
      Math.round(grossKobo * discountFactor),
      order.totals.totalKobo - alreadyRefunded,
    );

    // Will this return exhaust the sale?
    const isFullyReturned = [...soldByProduct.entries()].every(([productId, item]) => {
      const req = requested.find((line) => line.productId === productId)?.quantity ?? 0;
      return (returned[productId] ?? 0) + req >= item.quantity;
    });

    const actor: Actor = { id: principal.sub, role: principal.roles[0], type: ActorType.STAFF };
    const branchId = order.branchId.toString();

    await this.tx.run(async (session) => {
      await this.refunds.recordOfflineRefund(
        orderId,
        refundKobo,
        input.reason,
        principal.sub,
        session,
      );

      for (const line of requested) {
        await this.inventory.returnStock(
          branchId,
          line.productId,
          line.quantity,
          principal.sub,
          orderId,
          input.reason,
          session,
        );
      }

      // Record the return on the sale itself (compliance trail + cumulative limits).
      await this.orderModel.updateOne(
        { _id: order._id },
        {
          $push: {
            'counterSale.returns': {
              byStaffId: new Types.ObjectId(principal.sub),
              reason: input.reason,
              items: requested.map((line) => ({
                productId: new Types.ObjectId(line.productId),
                quantity: line.quantity,
              })),
              refundKobo,
              at: new Date(),
            },
          },
        },
        { session },
      );

      if (isFullyReturned) {
        await this.orders.releaseAndTransition(
          orderId,
          OrderStatus.REFUNDED,
          actor,
          input.reason,
          session,
        );
      }

      await this.audit.record(
        {
          actorId: principal.sub,
          actorType: ActorType.STAFF,
          action: 'pos.return',
          targetType: 'order',
          targetId: orderId,
          branchId,
          metadata: {
            orderNo: order.orderNo,
            refundKobo,
            reason: input.reason,
            items: requested,
            fullReturn: isFullyReturned,
          },
        },
        session,
      );
    });

    return {
      orderId,
      refundKobo,
      orderStatus: isFullyReturned ? OrderStatus.REFUNDED : OrderStatus.COMPLETED,
      restocked: requested,
    };
  }

  /** Counter sales for the sales panel. Cashiers see their own; managers the branch. */
  async listSales(principal: AuthPrincipal, query: PosSalesQuery): Promise<{ data: PosSaleDto[] }> {
    const dayStart = query.date ? new Date(`${query.date}T00:00:00`) : this.startOfToday();
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const filter: Record<string, unknown> = {
      'fulfillment.type': FulfillmentType.COUNTER,
      createdAt: { $gte: dayStart, $lt: dayEnd },
    };
    if (query.branchId) {
      if (
        !principal.branchScope.includes('ALL') &&
        !principal.branchScope.includes(query.branchId)
      ) {
        throw new DomainError(ErrorCode.BRANCH_SCOPE_VIOLATION, 'Outside your branch scope');
      }
      filter.branchId = new Types.ObjectId(query.branchId);
    } else if (!principal.branchScope.includes('ALL')) {
      filter.branchId = { $in: principal.branchScope.map((id) => new Types.ObjectId(id)) };
    }

    // Cashiers (no order:transition permission) only ever see their own sales.
    const restrictedToSelf = !principal.permissions.includes('order:transition');
    if (restrictedToSelf || isQueryTrue(query.mine)) {
      filter['counterSale.cashierStaffId'] = new Types.ObjectId(principal.sub);
    }

    const rows = await this.orderModel.find(filter).sort({ createdAt: -1 }).limit(query.limit);

    // Batch-fetch cashier + customer records once (avoids N+1 over the result set).
    const cashierIds = uniqueIds(rows.map((o) => o.counterSale?.cashierStaffId));
    const customerIds = uniqueIds(rows.map((o) => o.customerId));
    const [cashiers, customers] = await Promise.all([
      cashierIds.length
        ? this.staffModel
            .find({ _id: { $in: cashierIds } })
            .select('firstName lastName')
            .lean()
        : [],
      customerIds.length
        ? this.customerModel
            .find({ _id: { $in: customerIds } })
            .select('firstName lastName phone isWalkIn')
            .lean()
        : [],
    ]);
    const cashierById = new Map(cashiers.map((c) => [c._id.toString(), c]));
    const customerById = new Map(customers.map((c) => [c._id.toString(), c]));

    const data = rows.map((o) => this.toDto(o, principal, { cashierById, customerById }));
    return { data };
  }

  /* ── helpers ── */

  /** Fetch the cashier + customer for a single order, then map it to a DTO. */
  private async hydrateOne(order: OrderDocument, principal: AuthPrincipal): Promise<PosSaleDto> {
    const cashierId = order.counterSale?.cashierStaffId?.toString() ?? principal.sub;
    const [cashier, customer] = await Promise.all([
      this.staffModel.findById(cashierId).select('firstName lastName').lean(),
      this.customerModel
        .findById(order.customerId)
        .select('firstName lastName phone isWalkIn')
        .lean(),
    ]);
    return this.toDto(order, principal, {
      cashierById: new Map(cashier ? [[cashierId, cashier]] : []),
      customerById: new Map(customer ? [[order.customerId.toString(), customer]] : []),
    });
  }

  private startOfToday(): Date {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }

  private toDto(
    order: OrderDocument,
    principal: AuthPrincipal,
    lookups: {
      cashierById: Map<string, { firstName?: string; lastName?: string }>;
      customerById: Map<
        string,
        { firstName?: string; lastName?: string; phone?: string; isWalkIn?: boolean }
      >;
    },
  ): PosSaleDto {
    const cashierId = order.counterSale?.cashierStaffId?.toString() ?? principal.sub;
    const cashier = lookups.cashierById.get(cashierId);
    const customer = lookups.customerById.get(order.customerId.toString());

    return {
      orderId: order._id.toString(),
      orderNo: order.orderNo,
      branchId: order.branchId.toString(),
      items: order.items.map((i) => ({
        productId: i.productId.toString(),
        name: i.name,
        form: i.form,
        strength: i.strength,
        unitPriceKobo: i.unitPriceKobo,
        quantity: i.quantity,
        lineTotalKobo: i.lineTotalKobo,
        requiresPrescription: i.requiresPrescription,
      })),
      totals: {
        subtotalKobo: order.totals.subtotalKobo,
        discountKobo: order.totals.discountKobo ?? 0,
        totalKobo: order.totals.totalKobo,
        currency: order.totals.currency,
      },
      payment: {
        channel: order.counterSale?.paymentChannel ?? 'cash',
        paidAt: (order.payment.paidAt ?? new Date()).toISOString(),
      },
      // Pre-split records fall back to a single full-amount entry.
      payments: order.counterSale?.payments?.length
        ? order.counterSale.payments.map((p) => ({ channel: p.channel, amountKobo: p.amountKobo }))
        : [
            {
              channel: order.counterSale?.paymentChannel ?? 'cash',
              amountKobo: order.totals.totalKobo,
            },
          ],
      cashier: {
        id: cashierId,
        name: cashier ? `${cashier.firstName} ${cashier.lastName}` : undefined,
      },
      customer:
        customer && !customer.isWalkIn
          ? {
              id: order.customerId.toString(),
              name: `${customer.firstName} ${customer.lastName}`,
              phone: customer.phone,
            }
          : undefined,
      rxNote: order.counterSale?.rxNote,
      returnedByProduct: this.returnedByProduct(order),
      orderStatus: order.status,
      createdAt:
        (order as unknown as { createdAt?: Date }).createdAt?.toISOString() ??
        new Date().toISOString(),
    };
  }

  /** Cumulative returned quantity per product across all returns on a sale. */
  private returnedByProduct(order: OrderDocument): Record<string, number> | undefined {
    const returns = order.counterSale?.returns;
    if (!returns?.length) return undefined;
    const map: Record<string, number> = {};
    for (const ret of returns) {
      for (const item of ret.items) {
        const key = item.productId.toString();
        map[key] = (map[key] ?? 0) + item.quantity;
      }
    }
    return map;
  }
}
