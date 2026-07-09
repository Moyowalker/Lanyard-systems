import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { randomBytes } from 'node:crypto';
import {
  ActorType,
  CreateOrderInput,
  Currency,
  ErrorCode,
  FulfillmentType,
  OrderDto,
  OrderPaymentStatus,
  OrderStatus,
  Paginated,
  PaginationQuery,
  QuoteDto,
  ReorderResultDto,
  RxStatus,
  VerificationDecision,
} from '@lanyard/contracts';

import { Order, OrderDocument } from '../infrastructure/order.schema';
import { Branch } from '../../branch/infrastructure/branch.schema';
import { Prescription } from '../../prescription/infrastructure/prescription.schema';
import { CartService } from '../../cart/application/cart.service';
import { InventoryService } from '../../inventory/application/inventory.service';
import { NotificationService } from '../../notification/application/notification.service';
import { AuditService } from '../../../core/platform/audit.service';
import { TransactionService } from '../../../core/platform/transaction.service';
import { DomainError } from '../../../core/errors/domain-error';
import { assertTransition } from '../domain/order-state-machine';
import { cursorFilter, paginate } from '../../../core/pagination/cursor';
import { AuthPrincipal } from '../../../core/auth/principal';

export interface Actor {
  id?: string;
  role?: string;
  type: ActorType;
}

/** Statuses where stock is reserved but not yet dispensed (release on cancel/refund). */
const RESERVED_STATES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.STOCK_HOLD,
  OrderStatus.FULFILLING,
  OrderStatus.READY_FOR_PICKUP,
  OrderStatus.OUT_FOR_DELIVERY,
];

@Injectable()
export class OrderService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Branch.name) private readonly branchModel: Model<Branch>,
    @InjectModel(Prescription.name) private readonly rxModel: Model<Prescription>,
    private readonly cart: CartService,
    private readonly inventory: InventoryService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
    private readonly tx: TransactionService,
  ) {}

  /* ── creation ── */

  async createOrder(principal: AuthPrincipal, dto: CreateOrderInput): Promise<OrderDto> {
    const customerId = principal.sub;
    const res = await this.cart.resolve({ customerId });

    if (!res.branchId || res.lines.length === 0) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Cart is empty');
    }
    const unavailable = res.lines.filter((l) => l.unitPriceKobo === undefined || !l.inStock);
    if (unavailable.length > 0) {
      throw new DomainError(
        ErrorCode.CONFLICT,
        'One or more items are unavailable at this branch',
        [{ field: 'items', issue: unavailable.map((u) => u.name).join(', ') }],
      );
    }

    const prescriptionIds = dto.prescriptionIds ?? res.prescriptionIds;
    if (res.requiresRxVerification) {
      if (prescriptionIds.length === 0) {
        throw new DomainError(
          ErrorCode.VALIDATION_FAILED,
          'This order contains prescription-only items; a prescription is required',
        );
      }
      const count = await this.rxModel.countDocuments({
        _id: { $in: prescriptionIds.map((id) => new Types.ObjectId(id)) },
        customerId: new Types.ObjectId(customerId),
        branchId: new Types.ObjectId(res.branchId),
      });
      if (count !== prescriptionIds.length) {
        throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Invalid prescription reference');
      }
    }

    let deliveryKobo = 0;
    let deliveryZoneName: string | undefined;
    let etaMins: number | undefined;
    if (dto.fulfillment.type === FulfillmentType.DELIVERY) {
      const branch = await this.branchModel.findById(res.branchId).lean();
      if (!branch?.fulfillment?.delivery) {
        throw new DomainError(ErrorCode.CONFLICT, 'This branch does not offer delivery');
      }
      const zone = this.selectDeliveryZone(
        branch.fulfillment.deliveryZones,
        dto.fulfillment.deliveryZoneName,
      );
      deliveryKobo = zone?.feeKobo ?? 0;
      deliveryZoneName = zone?.name;
      etaMins = zone?.etaMins;
    }

    const subtotalKobo = res.subtotalKobo;
    const totalKobo = subtotalKobo + deliveryKobo;
    const initialStatus = res.requiresRxVerification
      ? OrderStatus.AWAITING_RX_VERIFICATION
      : OrderStatus.AWAITING_PAYMENT;

    const orderNo = this.genOrderNo();
    const now = new Date();

    const created = await this.tx.run(async (session) => {
      const [order] = await this.orderModel.create(
        [
          {
            orderNo,
            customerId: new Types.ObjectId(customerId),
            branchId: new Types.ObjectId(res.branchId),
            status: initialStatus,
            fulfillment: {
              type: dto.fulfillment.type,
              address: dto.fulfillment.address,
              feeKobo: deliveryKobo,
              deliveryZoneName,
              etaMins,
            },
            items: res.lines.map((l) => ({
              productId: new Types.ObjectId(l.productId),
              name: l.name,
              unitPriceKobo: l.unitPriceKobo,
              quantity: l.quantity,
              lineTotalKobo: l.lineTotalKobo,
              requiresPrescription: l.requiresPrescription,
            })),
            prescriptionIds: prescriptionIds.map((id) => new Types.ObjectId(id)),
            requiresRxVerification: res.requiresRxVerification,
            totals: {
              subtotalKobo,
              discountKobo: 0,
              deliveryKobo,
              totalKobo,
              currency: Currency.NGN,
            },
            payment: { status: 'unpaid' },
            statusHistory: [
              {
                from: OrderStatus.CREATED,
                to: initialStatus,
                actorId: new Types.ObjectId(customerId),
                actorRole: 'customer',
                branchId: new Types.ObjectId(res.branchId),
                at: now,
              },
            ],
          },
        ],
        { session },
      );

      if (prescriptionIds.length > 0) {
        await this.rxModel.updateMany(
          { _id: { $in: prescriptionIds.map((id) => new Types.ObjectId(id)) } },
          { $addToSet: { linkedOrderIds: order._id } },
          { session },
        );
      }

      await this.audit.record(
        {
          actorId: customerId,
          actorType: ActorType.CUSTOMER,
          action: 'order.create',
          targetType: 'order',
          targetId: order._id.toString(),
          branchId: res.branchId,
          metadata: { orderNo, totalKobo, requiresRx: res.requiresRxVerification, initialStatus },
        },
        session,
      );

      return order;
    });

    await this.cart.clear(customerId);
    return this.toDto(created);
  }

  /* ── Rx decision → advance linked orders (called by PrescriptionService) ── */

  async handleRxDecision(
    prescriptionId: string,
    decision: VerificationDecision,
    actor: Actor,
  ): Promise<void> {
    const orders = await this.orderModel.find({
      prescriptionIds: new Types.ObjectId(prescriptionId),
      status: OrderStatus.AWAITING_RX_VERIFICATION,
    });

    for (const order of orders) {
      if (decision === VerificationDecision.REJECTED) {
        await this.applyAndSave(order, OrderStatus.RX_REJECTED, actor, 'Prescription rejected');
        continue;
      }
      // Verified: only advance once ALL linked prescriptions are verified.
      const linked = await this.rxModel
        .find({ _id: { $in: order.prescriptionIds } })
        .select('status')
        .lean();
      const allVerified = linked.length > 0 && linked.every((r) => r.status === RxStatus.VERIFIED);
      if (!allVerified) continue;

      order.rxVerifiedAt = new Date();
      if (actor.id) order.rxVerifiedByStaffId = new Types.ObjectId(actor.id);
      this.apply(order, OrderStatus.RX_VERIFIED, actor, 'All prescriptions verified');
      this.apply(order, OrderStatus.AWAITING_PAYMENT, actor, 'Ready for payment');
      await order.save();
      await this.audit.record({
        actorId: actor.id,
        actorType: actor.type,
        action: 'order.rx_verified',
        targetType: 'order',
        targetId: order._id.toString(),
        branchId: order.branchId.toString(),
      });
    }
  }

  /* ── quote (no persistence) ── */

  async quote(customerId: string, fulfillment: CreateOrderInput['fulfillment']): Promise<QuoteDto> {
    const res = await this.cart.resolve({ customerId });
    if (!res.branchId || res.lines.length === 0) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Cart is empty');
    }
    let deliveryKobo = 0;
    let deliveryZoneName: string | undefined;
    let etaMins: number | undefined;
    if (fulfillment.type === FulfillmentType.DELIVERY) {
      const branch = await this.branchModel.findById(res.branchId).lean();
      const zone = this.selectDeliveryZone(
        branch?.fulfillment?.deliveryZones,
        fulfillment.deliveryZoneName,
      );
      deliveryKobo = zone?.feeKobo ?? 0;
      deliveryZoneName = zone?.name;
      etaMins = zone?.etaMins;
    }
    return {
      branchId: res.branchId,
      items: res.lines.map((l) => ({
        productId: l.productId,
        name: l.name,
        unitPriceKobo: l.unitPriceKobo ?? 0,
        quantity: l.quantity,
        lineTotalKobo: l.lineTotalKobo ?? 0,
        requiresPrescription: l.requiresPrescription,
      })),
      subtotalKobo: res.subtotalKobo,
      deliveryKobo,
      deliveryZoneName,
      etaMins,
      totalKobo: res.subtotalKobo + deliveryKobo,
      currency: Currency.NGN,
      requiresRxVerification: res.requiresRxVerification,
    };
  }

  /* ── reads ── */

  async getMine(customerId: string, query: PaginationQuery): Promise<Paginated<OrderDto>> {
    const rows = await this.orderModel
      .find({ customerId: new Types.ObjectId(customerId), ...cursorFilter(query.cursor) })
      .sort({ _id: 1 })
      .limit(query.limit + 1);
    return paginate(
      rows.map((o) => this.toDto(o)),
      query.limit,
    );
  }

  async getMineOne(customerId: string, id: string): Promise<OrderDto> {
    const order = await this.orderModel.findOne({
      _id: id,
      customerId: new Types.ObjectId(customerId),
    });
    if (!order) throw new DomainError(ErrorCode.NOT_FOUND, 'Order not found');
    return this.toDto(order);
  }

  async tracking(customerId: string, id: string) {
    const order = await this.getMineOne(customerId, id);
    const doc = await this.orderModel.findById(id).select('statusHistory').lean();
    return { status: order.status, history: doc?.statusHistory ?? [] };
  }

  async reorder(customerId: string, id: string): Promise<ReorderResultDto> {
    const order = await this.orderModel.findOne({
      _id: id,
      customerId: new Types.ObjectId(customerId),
    });
    if (!order) throw new DomainError(ErrorCode.NOT_FOUND, 'Order not found');

    const unavailableItems: ReorderResultDto['unavailableItems'] = [];
    for (const item of order.items) {
      try {
        await this.cart.addItem(
          { customerId },
          {
            branchId: order.branchId.toString(),
            productId: item.productId.toString(),
            quantity: item.quantity,
          },
        );
      } catch (error) {
        unavailableItems.push({
          productId: item.productId.toString(),
          name: item.name,
          reason: error instanceof Error ? error.message : 'Unavailable',
        });
      }
    }

    const cart = await this.cart.toDto({ customerId });
    for (const line of cart.items) {
      if (line.unitPriceKobo === undefined || !line.inStock) {
        unavailableItems.push({
          productId: line.productId,
          name: line.name,
          reason: line.inStock ? 'Pricing unavailable at this branch' : 'Insufficient branch stock',
        });
      }
    }

    return { cart, unavailableItems };
  }

  /* ── payment settlement (called by PaymentService inside its transaction) ── */

  /**
   * Marks an order PAID and reserves inventory. Idempotent: a re-delivered payment
   * event finds the order already PAID and no-ops. On any stock shortfall the order
   * goes to STOCK_HOLD for staff resolution (still paid). Runs in the caller's session.
   */
  async markPaid(
    orderId: string,
    opts: { intentId?: string },
    session: ClientSession,
  ): Promise<OrderStatus> {
    const order = await this.orderModel.findById(orderId).session(session);
    if (!order) throw new DomainError(ErrorCode.NOT_FOUND, 'Order not found');

    // Idempotent: already settled.
    if (order.status === OrderStatus.PAID || order.status === OrderStatus.STOCK_HOLD) {
      return order.status;
    }
    if (order.status !== OrderStatus.AWAITING_PAYMENT) {
      throw new DomainError(ErrorCode.CONFLICT, `Order ${order.orderNo} is not awaiting payment`);
    }

    const actor: Actor = { type: ActorType.SYSTEM, role: 'system' };
    this.apply(order, OrderStatus.PAID, actor, 'Payment received');
    order.payment.status = OrderPaymentStatus.PAID;
    order.payment.paidAt = new Date();
    if (opts.intentId) order.payment.intentId = new Types.ObjectId(opts.intentId);

    let shortfall = false;
    for (const item of order.items) {
      const ok = await this.inventory.reserve(
        order.branchId.toString(),
        item.productId.toString(),
        item.quantity,
        session,
        order._id.toString(),
      );
      if (!ok) shortfall = true;
    }
    if (shortfall)
      this.apply(order, OrderStatus.STOCK_HOLD, actor, 'Insufficient stock at payment');

    await order.save({ session });
    await this.audit.record(
      {
        actorType: ActorType.SYSTEM,
        action: 'order.paid',
        targetType: 'order',
        targetId: order._id.toString(),
        branchId: order.branchId.toString(),
        metadata: { intentId: opts.intentId, finalStatus: order.status, shortfall },
      },
      session,
    );
    return order.status;
  }

  /* ── admin ── */

  async listAdmin(query: PaginationQuery, branchScope: string[]): Promise<Paginated<OrderDto>> {
    const filter: Record<string, unknown> = { ...cursorFilter(query.cursor) };
    if (!branchScope.includes('ALL')) {
      filter.branchId = { $in: branchScope.map((id) => new Types.ObjectId(id)) };
    }
    const rows = await this.orderModel
      .find(filter)
      .sort({ _id: 1 })
      .limit(query.limit + 1);
    return paginate(
      rows.map((o) => this.toDto(o)),
      query.limit,
    );
  }

  async getAdminOne(id: string, branchScope: string[]): Promise<OrderDto> {
    const order = await this.orderModel.findById(id);
    if (!order) throw new DomainError(ErrorCode.NOT_FOUND, 'Order not found');
    if (!branchScope.includes('ALL') && !branchScope.includes(order.branchId.toString())) {
      throw new DomainError(ErrorCode.BRANCH_SCOPE_VIOLATION, 'Outside your branch scope');
    }
    return this.toDto(order);
  }

  async transition(id: string, to: OrderStatus, actor: Actor, reason?: string): Promise<OrderDto> {
    const order = await this.orderModel.findById(id);
    if (!order) throw new DomainError(ErrorCode.NOT_FOUND, 'Order not found');
    this.apply(order, to, actor, reason);
    await order.save();
    await this.audit.record({
      actorId: actor.id,
      actorType: actor.type,
      action: 'order.transition',
      targetType: 'order',
      targetId: order._id.toString(),
      branchId: order.branchId.toString(),
      metadata: { to, reason },
    });
    return this.toDto(order);
  }

  /** Routes a staff transition: side-effecting targets get dedicated handling. */
  async adminTransition(
    id: string,
    to: OrderStatus,
    actor: Actor,
    reason?: string,
  ): Promise<OrderDto> {
    switch (to) {
      case OrderStatus.COMPLETED:
        return this.complete(id, actor, reason);
      case OrderStatus.CANCELLED:
        return this.cancel(id, actor, reason);
      case OrderStatus.REFUNDED:
        throw new DomainError(ErrorCode.CONFLICT, 'Use the refund endpoint to refund an order');
      default:
        return this.transition(id, to, actor, reason);
    }
  }

  /** Complete an order: dispense reserved stock (reserved→onHand decrement) atomically. */
  async complete(id: string, actor: Actor, reason?: string): Promise<OrderDto> {
    const updated = await this.tx.run((session) =>
      this.completeInSession(id, actor, reason ?? 'Order completed', session),
    );
    await this.notifications.notifyOrderEvent(id, 'order.completed');
    return this.toDto(updated);
  }

  /**
   * Session-scoped completion core: applies →COMPLETED and dispenses each line.
   * Used by complete() (own transaction + notification) and by the POS, which
   * settles payment + completion in ONE transaction and sends no notifications.
   */
  async completeInSession(
    id: string,
    actor: Actor,
    reason: string,
    session: ClientSession,
  ): Promise<OrderDocument> {
    const order = await this.orderModel.findById(id).session(session);
    if (!order) throw new DomainError(ErrorCode.NOT_FOUND, 'Order not found');
    this.apply(order, OrderStatus.COMPLETED, actor, reason);
    for (const item of order.items) {
      await this.inventory.dispense(
        order.branchId.toString(),
        item.productId.toString(),
        item.quantity,
        session,
        order._id.toString(),
      );
    }
    await order.save({ session });
    await this.audit.record(
      {
        actorId: actor.id,
        actorType: actor.type,
        action: 'order.completed',
        targetType: 'order',
        targetId: order._id.toString(),
        branchId: order.branchId.toString(),
        metadata: { dispensedItems: order.items.length },
      },
      session,
    );
    return order;
  }

  /** Cancel an order, releasing any held stock reservation. */
  async cancel(id: string, actor: Actor, reason?: string): Promise<OrderDto> {
    const updated = await this.tx.run((session) =>
      this.releaseAndTransition(
        id,
        OrderStatus.CANCELLED,
        actor,
        reason ?? 'Order cancelled',
        session,
      ),
    );
    return this.toDto(updated);
  }

  /**
   * Transition to a terminal state (CANCELLED/REFUNDED), releasing the stock reservation
   * if the order still holds one (paid but not yet dispensed). Runs in the caller's
   * session so a refund can settle money + stock + status atomically.
   */
  async releaseAndTransition(
    id: string,
    to: OrderStatus,
    actor: Actor,
    reason: string,
    session: ClientSession,
  ): Promise<OrderDocument> {
    const order = await this.orderModel.findById(id).session(session);
    if (!order) throw new DomainError(ErrorCode.NOT_FOUND, 'Order not found');
    const wasReserved = RESERVED_STATES.includes(order.status);
    if (wasReserved) {
      for (const item of order.items) {
        await this.inventory.release(
          order.branchId.toString(),
          item.productId.toString(),
          item.quantity,
          session,
          order._id.toString(),
        );
      }
    }
    this.apply(order, to, actor, reason);
    if (to === OrderStatus.REFUNDED) order.payment.status = OrderPaymentStatus.REFUNDED;
    await order.save({ session });
    await this.audit.record(
      {
        actorId: actor.id,
        actorType: actor.type,
        action: to === OrderStatus.REFUNDED ? 'order.refunded' : 'order.cancelled',
        targetType: 'order',
        targetId: order._id.toString(),
        branchId: order.branchId.toString(),
        metadata: { reason, releasedReservation: wasReserved },
      },
      session,
    );
    return order;
  }

  /* ── helpers ── */

  private apply(order: OrderDocument, to: OrderStatus, actor: Actor, reason?: string): void {
    assertTransition(order.status, to);
    order.statusHistory.push({
      from: order.status,
      to,
      actorId: actor.id ? new Types.ObjectId(actor.id) : undefined,
      actorRole: actor.role,
      branchId: order.branchId,
      reason,
      at: new Date(),
    });
    order.status = to;
  }

  private async applyAndSave(
    order: OrderDocument,
    to: OrderStatus,
    actor: Actor,
    reason?: string,
  ): Promise<void> {
    this.apply(order, to, actor, reason);
    await order.save();
    await this.audit.record({
      actorId: actor.id,
      actorType: actor.type,
      action: 'order.transition',
      targetType: 'order',
      targetId: order._id.toString(),
      branchId: order.branchId.toString(),
      metadata: { to, reason },
    });
  }

  /** Human-friendly unique order reference; shared with the POS module. */
  genOrderNo(): string {
    return `LNY-${randomBytes(4).toString('hex').toUpperCase()}`;
  }

  private selectDeliveryZone(
    zones?: Array<{ name: string; feeKobo: number; etaMins?: number }>,
    requestedName?: string,
  ) {
    if (!zones || zones.length === 0) return undefined;
    if (!requestedName) return zones[0];
    return zones.find((zone) => zone.name === requestedName) ?? zones[0];
  }

  private toDto(o: OrderDocument): OrderDto {
    return {
      id: o._id.toString(),
      orderNo: o.orderNo,
      customerId: o.customerId.toString(),
      branchId: o.branchId.toString(),
      status: o.status,
      fulfillment: {
        type: o.fulfillment.type,
        address: o.fulfillment.address as Record<string, unknown> | undefined,
        deliveryZoneName: o.fulfillment.deliveryZoneName,
        etaMins: o.fulfillment.etaMins,
      },
      items: o.items.map((i) => ({
        productId: i.productId.toString(),
        name: i.name,
        unitPriceKobo: i.unitPriceKobo,
        quantity: i.quantity,
        lineTotalKobo: i.lineTotalKobo,
        requiresPrescription: i.requiresPrescription,
      })),
      prescriptionIds: o.prescriptionIds.map(String),
      requiresRxVerification: o.requiresRxVerification,
      totals: o.totals,
      payment: { status: o.payment.status },
      createdAt: (o as unknown as { createdAt: Date }).createdAt.toISOString(),
    };
  }
}
