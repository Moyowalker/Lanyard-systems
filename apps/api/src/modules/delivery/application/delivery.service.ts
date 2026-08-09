import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ActorType,
  DeliveryActionInput,
  DeliveryBoardDto,
  DeliveryBoardItemDto,
  DeliveryDto,
  DeliveryStatus,
  DispatchDeliveryInput,
  ErrorCode,
  FulfillmentType,
  OrderStatus,
} from '@lanyard/contracts';

import { Delivery, DeliveryDocument } from '../infrastructure/delivery.schema';
import { Order } from '../../order/infrastructure/order.schema';
import { OrderService } from '../../order/application/order.service';
import { AuditService } from '../../../core/platform/audit.service';
import { DomainError } from '../../../core/errors/domain-error';
import { AuthPrincipal } from '../../../core/auth/principal';

/** Order states a delivery-bound order can be in while it's on the board. */
const BOARD_STATES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.STOCK_HOLD,
  OrderStatus.FULFILLING,
  OrderStatus.OUT_FOR_DELIVERY,
];

/**
 * Pure mapping from a staff delivery action to the resulting delivery status and the
 * order transition it should drive. `orderTarget: null` means the order is not moved
 * (e.g. a failed attempt — the order stays put so staff can re-dispatch). Exported for
 * unit testing.
 */
export function mapDeliveryAction(action: DeliveryActionInput['action']): {
  deliveryStatus: DeliveryStatus;
  orderTarget: OrderStatus | null;
} {
  switch (action) {
    case 'out_for_delivery':
      return {
        deliveryStatus: DeliveryStatus.OUT_FOR_DELIVERY,
        orderTarget: OrderStatus.OUT_FOR_DELIVERY,
      };
    case 'delivered':
      return { deliveryStatus: DeliveryStatus.DELIVERED, orderTarget: OrderStatus.COMPLETED };
    case 'failed':
      return { deliveryStatus: DeliveryStatus.FAILED, orderTarget: null };
  }
}

@Injectable()
export class DeliveryService {
  constructor(
    @InjectModel(Delivery.name) private readonly deliveryModel: Model<Delivery>,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    private readonly orders: OrderService,
    private readonly audit: AuditService,
  ) {}

  /** Delivery-bound orders in scope, each annotated with its delivery record (if any). */
  async board(branchScope: string[], branchId?: string): Promise<DeliveryBoardDto> {
    const filter: Record<string, unknown> = {
      'fulfillment.type': FulfillmentType.DELIVERY,
      status: { $in: BOARD_STATES },
    };
    if (branchId) {
      filter.branchId =
        branchScope.includes('ALL') || branchScope.includes(branchId)
          ? new Types.ObjectId(branchId)
          : new Types.ObjectId('000000000000000000000000');
    } else if (!branchScope.includes('ALL')) {
      filter.branchId = { $in: branchScope.map((id) => new Types.ObjectId(id)) };
    }

    const orders = await this.orderModel.find(filter).sort({ _id: -1 }).limit(100).lean();
    const orderIds = orders.map((o) => o._id);
    const deliveries = await this.deliveryModel.find({ orderId: { $in: orderIds } });
    const byOrder = new Map(deliveries.map((d) => [d.orderId.toString(), d]));

    const data: DeliveryBoardItemDto[] = orders.map((o) => {
      const delivery = byOrder.get(o._id.toString());
      const addr = o.fulfillment?.address;
      return {
        orderId: o._id.toString(),
        orderNo: o.orderNo,
        orderStatus: o.status,
        totalKobo: o.totals.totalKobo,
        deliveryFeeKobo: o.totals.deliveryKobo ?? o.fulfillment?.feeKobo ?? 0,
        etaMins: o.fulfillment?.etaMins,
        address: addr ? { line1: addr.line1, city: addr.city, state: addr.state } : undefined,
        deliveryNote: o.fulfillment?.deliveryNote,
        createdAt: (o as unknown as { createdAt: Date }).createdAt.toISOString(),
        delivery: delivery ? this.toDto(delivery) : undefined,
      };
    });
    return { data };
  }

  /** Assign a rider and mark the delivery dispatched. Moves a paid order into FULFILLING. */
  async dispatch(
    principal: AuthPrincipal,
    orderId: string,
    input: DispatchDeliveryInput,
  ): Promise<DeliveryDto> {
    const order = await this.orderModel.findById(orderId);
    if (!order) throw new DomainError(ErrorCode.NOT_FOUND, 'Order not found');
    this.assertBranchScope(principal.branchScope, order.branchId.toString());

    if (order.fulfillment.type !== FulfillmentType.DELIVERY) {
      throw new DomainError(ErrorCode.CONFLICT, 'This order is not a delivery order');
    }
    const addr = order.fulfillment.address;
    if (!addr?.line1) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Order has no delivery address');
    }

    const actor = this.actor(principal);
    // Ensure the order is FULFILLING so a later "out for delivery" transition is legal.
    if (order.status === OrderStatus.PAID || order.status === OrderStatus.STOCK_HOLD) {
      await this.orders.adminTransition(
        orderId,
        OrderStatus.FULFILLING,
        actor,
        'Dispatch preparation',
      );
    }

    let delivery = await this.deliveryModel.findOne({ orderId: order._id });
    if (!delivery) {
      delivery = new this.deliveryModel({
        orderId: order._id,
        branchId: order.branchId,
        status: DeliveryStatus.QUEUED,
        address: {
          label: addr.label,
          line1: addr.line1,
          line2: addr.line2,
          city: addr.city,
          state: addr.state,
          country: addr.country ?? 'NG',
          landmark: addr.landmark,
          contactPhone: addr.contactPhone,
        },
        deliveryNote: order.fulfillment.deliveryNote,
        feeKobo: order.totals.deliveryKobo ?? order.fulfillment.feeKobo ?? 0,
        trackingEvents: [],
      });
    }

    delivery.riderInfo = {
      name: input.riderName,
      phone: input.riderPhone,
      vehicle: input.vehicle,
    };
    // Allow (re)dispatch from QUEUED or a prior FAILED attempt; otherwise keep current status.
    if (delivery.status === DeliveryStatus.QUEUED || delivery.status === DeliveryStatus.FAILED) {
      delivery.status = DeliveryStatus.DISPATCHED;
    }
    delivery.dispatchedAt = new Date();
    delivery.trackingEvents.push({
      status: DeliveryStatus.DISPATCHED,
      note: input.note,
      at: new Date(),
    });
    await delivery.save();

    await this.audit.record({
      actorId: principal.sub,
      actorType: ActorType.STAFF,
      action: 'delivery.dispatch',
      targetType: 'delivery',
      targetId: delivery._id.toString(),
      branchId: order.branchId.toString(),
      metadata: { orderId, rider: input.riderName },
    });
    return this.toDto(delivery);
  }

  /** Advance a delivery (out_for_delivery / delivered / failed), driving the order. */
  async act(
    principal: AuthPrincipal,
    orderId: string,
    input: DeliveryActionInput,
  ): Promise<DeliveryDto> {
    const delivery = await this.deliveryModel.findOne({ orderId: new Types.ObjectId(orderId) });
    if (!delivery) {
      throw new DomainError(ErrorCode.NOT_FOUND, 'No delivery has been dispatched for this order');
    }
    this.assertBranchScope(principal.branchScope, delivery.branchId.toString());

    const actor = this.actor(principal);
    const { deliveryStatus, orderTarget } = mapDeliveryAction(input.action);

    // Drive the order through its existing, tested transition first. The order state
    // machine rejects illegal sequences (e.g. "delivered" before "out for delivery"),
    // and COMPLETED reuses the proven stock-dispensing path — no new money/stock logic.
    if (orderTarget) {
      await this.orders.adminTransition(orderId, orderTarget, actor, `Delivery ${input.action}`);
    }

    delivery.status = deliveryStatus;
    if (deliveryStatus === DeliveryStatus.DELIVERED) delivery.deliveredAt = new Date();
    delivery.trackingEvents.push({ status: deliveryStatus, note: input.note, at: new Date() });
    await delivery.save();

    await this.audit.record({
      actorId: principal.sub,
      actorType: ActorType.STAFF,
      action: `delivery.${input.action}`,
      targetType: 'delivery',
      targetId: delivery._id.toString(),
      branchId: delivery.branchId.toString(),
      metadata: { orderId },
    });
    return this.toDto(delivery);
  }

  private actor(principal: AuthPrincipal) {
    return { id: principal.sub, role: principal.roles[0], type: ActorType.STAFF };
  }

  private assertBranchScope(branchScope: string[], branchId: string): void {
    if (!branchScope.includes('ALL') && !branchScope.includes(branchId)) {
      throw new DomainError(ErrorCode.BRANCH_SCOPE_VIOLATION, 'Outside your branch scope');
    }
  }

  private toDto(d: DeliveryDocument): DeliveryDto {
    return {
      id: d._id.toString(),
      orderId: d.orderId.toString(),
      status: d.status,
      rider: d.riderInfo
        ? { name: d.riderInfo.name, phone: d.riderInfo.phone, vehicle: d.riderInfo.vehicle }
        : undefined,
      deliveryNote: d.deliveryNote,
      feeKobo: d.feeKobo,
      dispatchedAt: d.dispatchedAt?.toISOString(),
      deliveredAt: d.deliveredAt?.toISOString(),
      trackingEvents: (d.trackingEvents ?? []).map((e) => ({
        status: e.status,
        note: e.note,
        at: e.at.toISOString(),
      })),
    };
  }
}
