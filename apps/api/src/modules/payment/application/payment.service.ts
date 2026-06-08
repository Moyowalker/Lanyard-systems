import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'node:crypto';
import {
  ActorType,
  ErrorCode,
  OrderPaymentStatus,
  PaymentChannel,
  PaymentIntentDto,
  PaymentInitDto,
  PaymentIntentStatus,
  PaymentTxnType,
} from '@lanyard/contracts';

import { PaymentIntent, PaymentTransaction } from '../infrastructure/payment.schemas';
import { Order } from '../../order/infrastructure/order.schema';
import { Customer } from '../../identity/infrastructure/identity.schemas';
import { OrderService } from '../../order/application/order.service';
import { NotificationService } from '../../notification/application/notification.service';
import { AuditService } from '../../../core/platform/audit.service';
import { TransactionService } from '../../../core/platform/transaction.service';
import { DomainError } from '../../../core/errors/domain-error';
import { AuthPrincipal } from '../../../core/auth/principal';
import {
  PAYMENT_PROVIDER,
  PaymentProviderPort,
  NormalizedCharge,
} from './provider/payment-provider.interface';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectModel(PaymentIntent.name) private readonly intentModel: Model<PaymentIntent>,
    @InjectModel(PaymentTransaction.name) private readonly txnModel: Model<PaymentTransaction>,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Customer.name) private readonly customerModel: Model<Customer>,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProviderPort,
    private readonly orders: OrderService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
    private readonly tx: TransactionService,
  ) {}

  /** Create (or reuse) a payment intent for an order awaiting payment. */
  async initialize(principal: AuthPrincipal, orderId: string): Promise<PaymentInitDto> {
    const order = await this.orderModel.findOne({
      _id: orderId,
      customerId: new Types.ObjectId(principal.sub),
    });
    if (!order) throw new DomainError(ErrorCode.NOT_FOUND, 'Order not found');
    if (order.status !== 'AWAITING_PAYMENT') {
      throw new DomainError(ErrorCode.CONFLICT, `Order ${order.orderNo} is not awaiting payment`);
    }

    // Idempotency: reuse an existing open intent rather than creating duplicates.
    const open = await this.intentModel.findOne({
      orderId: order._id,
      status: { $in: [PaymentIntentStatus.CREATED, PaymentIntentStatus.PENDING] },
    });
    if (open) return this.toInitDto(open);

    const customer = await this.customerModel.findById(order.customerId).lean();
    const ourRef = `LNYPAY_${randomBytes(8).toString('hex')}`;
    const init = await this.provider.initialize({
      amountKobo: order.totals.totalKobo,
      currency: order.totals.currency,
      email: customer?.email ?? `${order.customerId.toString()}@customer.lanyard.local`,
      reference: ourRef,
      metadata: { orderId: order._id.toString(), orderNo: order.orderNo },
    });

    const intent = await this.intentModel.create({
      orderId: order._id,
      provider: this.provider.key,
      providerRef: init.providerRef,
      ourRef,
      amountKobo: order.totals.totalKobo,
      currency: order.totals.currency,
      status: PaymentIntentStatus.PENDING,
      idempotencyKey: ourRef,
      redirectUrl: init.authorizationUrl,
    });

    order.payment.intentId = intent._id;
    order.payment.status = OrderPaymentStatus.PENDING;
    await order.save();

    return this.toInitDto(intent);
  }

  async getIntent(principal: AuthPrincipal, intentId: string): Promise<PaymentIntentDto> {
    const intent = await this.intentModel.findById(intentId);
    if (!intent) throw new DomainError(ErrorCode.NOT_FOUND, 'Payment not found');
    const owns = await this.orderModel.exists({
      _id: intent.orderId,
      customerId: new Types.ObjectId(principal.sub),
    });
    if (!owns) throw new DomainError(ErrorCode.NOT_FOUND, 'Payment not found');
    return this.toIntentDto(intent);
  }

  /**
   * Settle a normalised charge event — the SINGLE source of truth for payment success,
   * used by both the verified webhook and dev confirm. Idempotent (dedupes by
   * providerEventId), validates amount + currency, and marks the order paid + reserves
   * stock atomically.
   */
  async applyChargeEvent(ev: NormalizedCharge): Promise<{ status: string }> {
    const intent = await this.intentModel.findOne({
      $or: [{ ourRef: ev.reference }, ...(ev.providerRef ? [{ providerRef: ev.providerRef }] : [])],
    });
    if (!intent) {
      this.logger.warn(`Charge for unknown reference ${ev.reference} — ignored`);
      return { status: 'ignored' };
    }

    // Idempotent: this provider event was already processed.
    const dup = await this.txnModel.exists({ providerEventId: ev.providerEventId });
    if (dup) return { status: 'duplicate' };

    // Money integrity: amount + currency must match what we asked for (doc 10 R6/R9).
    if (ev.amountKobo !== intent.amountKobo || ev.currency !== intent.currency) {
      intent.status = PaymentIntentStatus.FAILED;
      await intent.save();
      await this.audit.record({
        actorType: ActorType.SYSTEM,
        action: 'payment.mismatch',
        targetType: 'payment_intent',
        targetId: intent._id.toString(),
        metadata: {
          expectedKobo: intent.amountKobo,
          gotKobo: ev.amountKobo,
          currency: ev.currency,
        },
      });
      throw new DomainError(ErrorCode.CONFLICT, 'Payment amount/currency mismatch');
    }

    if (ev.status !== 'success') {
      intent.status = PaymentIntentStatus.FAILED;
      intent.lastWebhookEventId = ev.providerEventId;
      await intent.save();
      await this.orderModel.updateOne(
        { _id: intent.orderId },
        { $set: { 'payment.status': OrderPaymentStatus.FAILED } },
      );
      return { status: 'failed' };
    }

    await this.tx.run(async (session) => {
      await this.txnModel.create(
        [
          {
            intentId: intent._id,
            orderId: intent.orderId,
            provider: intent.provider,
            providerEventId: ev.providerEventId,
            type: PaymentTxnType.CHARGE,
            status: 'success',
            amountKobo: ev.amountKobo,
            currency: ev.currency,
            channel: ev.channel ?? PaymentChannel.CARD,
            rawProviderPayload: ev.raw,
          },
        ],
        { session },
      );
      intent.status = PaymentIntentStatus.SUCCEEDED;
      intent.lastWebhookEventId = ev.providerEventId;
      await intent.save({ session });

      await this.orders.markPaid(
        intent.orderId.toString(),
        { intentId: intent._id.toString() },
        session,
      );

      await this.audit.record(
        {
          actorType: ActorType.SYSTEM,
          action: 'payment.succeeded',
          targetType: 'order',
          targetId: intent.orderId.toString(),
          metadata: { providerEventId: ev.providerEventId, amountKobo: ev.amountKobo },
        },
        session,
      );
    });

    // Notify the customer after the payment + reservation has committed.
    await this.notifications.notifyOrderEvent(intent.orderId.toString(), 'order.paid');

    return { status: 'ok' };
  }

  /** Reconciliation for intents stuck PENDING (missed webhooks). No-op under the mock provider. */
  async reconcile(): Promise<{ checked: number; settled: number }> {
    const stale = await this.intentModel.find({ status: PaymentIntentStatus.PENDING }).limit(50);
    let settled = 0;
    for (const intent of stale) {
      const result = await this.provider.verify(intent.providerRef ?? intent.ourRef);
      if (result.status === 'success' && result.amountKobo != null) {
        await this.applyChargeEvent({
          reference: intent.ourRef,
          providerRef: intent.providerRef,
          providerEventId: result.providerEventId ?? `verify_${intent.ourRef}`,
          status: 'success',
          amountKobo: result.amountKobo,
          currency: result.currency ?? intent.currency,
          channel: result.channel,
          raw: result.raw,
        });
        settled += 1;
      }
    }
    return { checked: stale.length, settled };
  }

  /* ── webhook + dev settlement entrypoints ── */

  async handleWebhook(signature: string | undefined, rawBody: Buffer): Promise<{ status: string }> {
    const ev = this.provider.parseWebhook(signature, rawBody);
    if (!ev) return { status: 'ignored' };
    return this.applyChargeEvent(ev);
  }

  /** Dev-only: synthesise a successful charge for an intent (mirrors a real webhook). */
  async devConfirm(intentId: string): Promise<{ status: string }> {
    const intent = await this.intentModel.findById(intentId);
    if (!intent) throw new DomainError(ErrorCode.NOT_FOUND, 'Payment not found');
    return this.applyChargeEvent({
      reference: intent.ourRef,
      providerRef: intent.providerRef,
      providerEventId: `dev_${intent.ourRef}`, // stable → replay is idempotent
      status: 'success',
      amountKobo: intent.amountKobo,
      currency: intent.currency,
      channel: PaymentChannel.CARD,
      raw: { dev: true },
    });
  }

  private toInitDto(intent: PaymentIntent & { _id: Types.ObjectId }): PaymentInitDto {
    return {
      intentId: intent._id.toString(),
      reference: intent.ourRef,
      authorizationUrl: intent.redirectUrl ?? '',
      provider: intent.provider,
      amountKobo: intent.amountKobo,
      currency: intent.currency,
    };
  }

  private toIntentDto(intent: PaymentIntent & { _id: Types.ObjectId }): PaymentIntentDto {
    return {
      id: intent._id.toString(),
      orderId: intent.orderId.toString(),
      provider: intent.provider,
      reference: intent.ourRef,
      amountKobo: intent.amountKobo,
      currency: intent.currency,
      status: intent.status,
    };
  }
}
