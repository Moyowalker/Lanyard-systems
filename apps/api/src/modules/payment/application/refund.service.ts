import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import {
  ActorType,
  ErrorCode,
  OrderPaymentStatus,
  OrderStatus,
  PaymentIntentStatus,
  PaymentTxnType,
  RefundDto,
  RefundInput,
  RefundStatus,
} from '@lanyard/contracts';

import { PaymentIntent, PaymentTransaction, Refund } from '../infrastructure/payment.schemas';
import { Order } from '../../order/infrastructure/order.schema';
import { OrderService } from '../../order/application/order.service';
import { AuditService } from '../../../core/platform/audit.service';
import { TransactionService } from '../../../core/platform/transaction.service';
import { DomainError } from '../../../core/errors/domain-error';
import { AuthPrincipal } from '../../../core/auth/principal';
import { PAYMENT_PROVIDER, PaymentProviderPort } from './provider/payment-provider.interface';

/**
 * Staff-initiated refunds (refund:create). Calls the provider, records an immutable
 * refund txn, releases any held stock reservation, and moves the order to REFUNDED —
 * the money + stock + status change settle atomically. Audited (doc 10 R9).
 */
@Injectable()
export class RefundService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(PaymentIntent.name) private readonly intentModel: Model<PaymentIntent>,
    @InjectModel(PaymentTransaction.name) private readonly txnModel: Model<PaymentTransaction>,
    @InjectModel(Refund.name) private readonly refundModel: Model<Refund>,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProviderPort,
    private readonly orders: OrderService,
    private readonly audit: AuditService,
    private readonly tx: TransactionService,
  ) {}

  async refund(principal: AuthPrincipal, input: RefundInput): Promise<RefundDto> {
    const order = await this.orderModel.findById(input.orderId);
    if (!order) throw new DomainError(ErrorCode.NOT_FOUND, 'Order not found');

    // Branch scope: staff may only refund orders at branches they cover.
    if (
      !principal.branchScope.includes('ALL') &&
      !principal.branchScope.includes(order.branchId.toString())
    ) {
      throw new DomainError(ErrorCode.BRANCH_SCOPE_VIOLATION, 'Outside your branch scope');
    }
    if (order.payment.status !== OrderPaymentStatus.PAID) {
      throw new DomainError(ErrorCode.CONFLICT, 'Order has no settled payment to refund');
    }

    const intent = await this.intentModel.findOne({
      orderId: order._id,
      status: PaymentIntentStatus.SUCCEEDED,
    });
    if (!intent) throw new DomainError(ErrorCode.CONFLICT, 'No successful payment to refund');

    const amount = input.amountKobo ?? order.totals.totalKobo;
    if (amount > order.totals.totalKobo) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Refund exceeds the order total');
    }

    // External provider call happens before the DB transaction.
    const providerRes = await this.provider.refund(intent.providerRef ?? intent.ourRef, amount);
    if (providerRes.status === 'failed') {
      throw new DomainError(ErrorCode.CONFLICT, 'Provider refund failed');
    }

    const refundStatus =
      providerRes.status === 'done' ? RefundStatus.DONE : RefundStatus.PROCESSING;

    const created = await this.tx.run(async (session) => {
      const [refund] = await this.refundModel.create(
        [
          {
            orderId: order._id,
            intentId: intent._id,
            amountKobo: amount,
            currency: intent.currency,
            reason: input.reason,
            status: refundStatus,
            requestedByStaffId: new Types.ObjectId(principal.sub),
            providerRefundRef: providerRes.providerRefundRef,
          },
        ],
        { session },
      );

      await this.txnModel.create(
        [
          {
            intentId: intent._id,
            orderId: order._id,
            provider: intent.provider,
            providerEventId: `refund_${providerRes.providerRefundRef ?? refund._id.toString()}`,
            type: PaymentTxnType.REFUND,
            status: providerRes.status,
            amountKobo: amount,
            currency: intent.currency,
            rawProviderPayload: providerRes.raw,
          },
        ],
        { session },
      );

      await this.orders.releaseAndTransition(
        order._id.toString(),
        OrderStatus.REFUNDED,
        { id: principal.sub, role: principal.roles[0], type: ActorType.STAFF },
        input.reason,
        session,
      );

      await this.audit.record(
        {
          actorId: principal.sub,
          actorType: ActorType.STAFF,
          action: 'refund.create',
          targetType: 'order',
          targetId: order._id.toString(),
          branchId: order.branchId.toString(),
          metadata: { amountKobo: amount, reason: input.reason, refundId: refund._id.toString() },
        },
        session,
      );

      return refund;
    });

    return {
      id: created._id.toString(),
      orderId: order._id.toString(),
      amountKobo: amount,
      currency: intent.currency,
      status: refundStatus,
      reason: input.reason,
    };
  }

  /**
   * Record a refund settled at the till (cash handed back / terminal reversal) — the
   * counterpart of `recordOfflinePayment`. NO provider call: POS intents are OFFLINE,
   * so the money moves physically at the counter. Immutable Refund + REFUND txn only;
   * order-status and restock decisions stay with the caller (PosService.returnSale).
   */
  async recordOfflineRefund(
    orderId: string,
    amountKobo: number,
    reason: string,
    requestedByStaffId: string,
    session: ClientSession,
  ): Promise<{ refundId: string }> {
    const intent = await this.intentModel
      .findOne({ orderId: new Types.ObjectId(orderId), status: PaymentIntentStatus.SUCCEEDED })
      .session(session);
    if (!intent) throw new DomainError(ErrorCode.CONFLICT, 'No successful payment to refund');

    const [refund] = await this.refundModel.create(
      [
        {
          orderId: new Types.ObjectId(orderId),
          intentId: intent._id,
          amountKobo,
          currency: intent.currency,
          reason,
          status: RefundStatus.DONE,
          requestedByStaffId: new Types.ObjectId(requestedByStaffId),
        },
      ],
      { session },
    );

    await this.txnModel.create(
      [
        {
          intentId: intent._id,
          orderId: new Types.ObjectId(orderId),
          provider: intent.provider,
          providerEventId: `refund_offline_${refund._id.toString()}`,
          type: PaymentTxnType.REFUND,
          status: 'done',
          amountKobo,
          currency: intent.currency,
        },
      ],
      { session },
    );

    return { refundId: refund._id.toString() };
  }
}
