import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Model, Types } from 'mongoose';
import {
  NotificationChannel,
  NotificationStatus,
  OtpPurpose,
  PrincipalType,
} from '@lanyard/contracts';

import { Notification } from '../infrastructure/notification.schema';
import { Order } from '../../order/infrastructure/order.schema';
import { Prescription } from '../../prescription/infrastructure/prescription.schema';
import { NOTIFICATION_QUEUE, NotificationJobData } from '../../../core/queue/queue.constants';
import { renderTemplate } from './templates';

/**
 * Event-driven notifications. Domain services call the notify* helpers at lifecycle
 * points; a Notification record is persisted (status QUEUED) and a BullMQ job enqueued
 * for the worker to render + deliver. Failures here never break the business flow.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectModel(Notification.name) private readonly notificationModel: Model<Notification>,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Prescription.name) private readonly rxModel: Model<Prescription>,
    @InjectQueue(NOTIFICATION_QUEUE) private readonly queue: Queue<NotificationJobData>,
  ) {}

  async notifyOrderEvent(orderId: string, template: string): Promise<void> {
    try {
      const order = await this.orderModel.findById(orderId).lean();
      if (!order) return;
      await this.enqueue(order.customerId.toString(), template, {
        orderNo: order.orderNo,
        totalKobo: order.totals.totalKobo,
        fulfillment: order.fulfillment.type,
      });
    } catch (err) {
      this.logger.error(`notifyOrderEvent(${template}) failed: ${(err as Error).message}`);
    }
  }

  async notifyRxEvent(prescriptionId: string, template: string): Promise<void> {
    try {
      const rx = await this.rxModel.findById(prescriptionId).lean();
      if (!rx) return;
      await this.enqueue(rx.customerId.toString(), template, {});
    } catch (err) {
      this.logger.error(`notifyRxEvent(${template}) failed: ${(err as Error).message}`);
    }
  }

  async notifyOtp(
    target: string,
    purpose: OtpPurpose,
    code: string,
    ttlSeconds: number,
  ): Promise<void> {
    const template = `otp.${purpose}`;
    const rendered = renderTemplate(template, {
      code,
      ttlMinutes: Math.max(1, Math.ceil(ttlSeconds / 60)),
    });

    await this.queue.add(
      'send-direct',
      {
        direct: {
          channel: NotificationChannel.SMS,
          to: target,
          subject: rendered.subject,
          text: rendered.text,
        },
      },
      { removeOnComplete: true, attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    );
  }

  private async enqueue(
    customerId: string,
    template: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const notification = await this.notificationModel.create({
      recipientId: new Types.ObjectId(customerId),
      recipientType: PrincipalType.CUSTOMER,
      channel: NotificationChannel.EMAIL,
      template,
      payload,
      status: NotificationStatus.QUEUED,
    });
    await this.queue.add(
      'send',
      { notificationId: notification._id.toString() },
      { removeOnComplete: true, attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    );
  }
}
