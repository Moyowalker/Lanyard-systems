import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ActorType,
  Currency,
  ErrorCode,
  FulfillmentType,
  OrderStatus,
  PosCreateSaleInput,
  PosSaleDto,
  PosSalesQuery,
  ProductStatus,
  RegulatoryClass,
  isQueryTrue,
} from '@lanyard/contracts';

import { Order, OrderDocument } from '../../order/infrastructure/order.schema';
import { Product } from '../../catalog/infrastructure/catalog.schemas';
import { StaffUser } from '../../identity/infrastructure/identity.schemas';
import { Customer } from '../../identity/infrastructure/identity.schemas';
import { OrderService, Actor } from '../../order/application/order.service';
import { PaymentService } from '../../payment/application/payment.service';
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
    private readonly orders: OrderService,
    private readonly payments: PaymentService,
    private readonly inventory: InventoryService,
    private readonly pricing: PricingService,
    private readonly customers: CustomerAuthService,
    private readonly audit: AuditService,
    private readonly tx: TransactionService,
  ) {}

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
    const priceMap = await this.pricing.getPriceMap(input.branchId, productIds);
    const unpriced = input.items.filter((i) => {
      const price = priceMap.get(i.productId);
      return !price || !price.isAvailable;
    });
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
                discountKobo: 0,
                deliveryKobo: 0,
                totalKobo: subtotalKobo,
                currency: Currency.NGN,
              },
              counterSale: {
                cashierStaffId: new Types.ObjectId(principal.sub),
                paymentChannel: input.payment.channel,
                rxNote: input.rxNote?.trim() || undefined,
                idempotencyKey: input.idempotencyKey,
              },
            },
          ],
          { session },
        );

        // Record the offline payment → marks PAID and reserves stock.
        await this.payments.recordOfflinePayment(
          created._id.toString(),
          input.payment.channel,
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
              channel: input.payment.channel,
              totalKobo: subtotalKobo,
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
        totalKobo: order.totals.totalKobo,
        currency: order.totals.currency,
      },
      payment: {
        channel: order.counterSale?.paymentChannel ?? 'cash',
        paidAt: (order.payment.paidAt ?? new Date()).toISOString(),
      },
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
      createdAt:
        (order as unknown as { createdAt?: Date }).createdAt?.toISOString() ??
        new Date().toISOString(),
    };
  }
}
