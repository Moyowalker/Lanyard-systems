import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Job } from 'bullmq';
import { NotificationChannel, NotificationStatus } from '@lanyard/contracts';

import { Notification } from '../infrastructure/notification.schema';
import { Customer } from '../../identity/infrastructure/identity.schemas';
import { EmailChannel } from '../application/channels/email.channel';
import { SmsChannel } from '../application/channels/sms.channel';
import { NotificationChannelPort, NotificationDeliveryError } from '../application/channels/channel.types';
import { renderTemplate } from '../application/templates';
import { NOTIFICATION_QUEUE, NotificationJobData } from '../../../core/queue/queue.constants';

/** Renders a queued notification and delivers it via the selected channel. */
@Processor(NOTIFICATION_QUEUE)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    @InjectModel(Notification.name) private readonly notificationModel: Model<Notification>,
    @InjectModel(Customer.name) private readonly customerModel: Model<Customer>,
    private readonly email: EmailChannel,
    private readonly sms: SmsChannel,
  ) {
    super();
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    if (job.data.direct) {
      const channel =
        job.data.direct.channel === NotificationChannel.EMAIL ? this.email : this.sms;
      try {
        await channel.send({
          to: job.data.direct.to,
          subject: job.data.direct.subject,
          text: job.data.direct.text,
        });
      } catch (err) {
        if (err instanceof NotificationDeliveryError && !err.retryable) {
          this.logger.warn(`Direct notification dropped: reason=${err.message}`);
          return;
        }
        throw err;
      }
      return;
    }

    if (!job.data.notificationId) return;

    const notification = await this.notificationModel.findById(job.data.notificationId);
    if (!notification) return;

    const customer = await this.customerModel.findById(notification.recipientId).lean();
    const email = customer?.email;
    const phone = customer?.phone;
    const name = customer?.firstName;

    // Prefer the requested channel; fall back to SMS if no email is on file.
    let channel: NotificationChannelPort = this.email;
    let to = email;
    if (notification.channel !== NotificationChannel.EMAIL || !email) {
      channel = this.sms;
      to = phone;
    }

    if (!to) {
      notification.status = NotificationStatus.FAILED;
      notification.error = 'No contact address for recipient';
      await notification.save();
      return;
    }

    const { subject, text } = renderTemplate(notification.template, notification.payload, name);

    try {
      const result = await channel.send({ to, subject, text });
      notification.status = NotificationStatus.SENT;
      notification.providerRef = result.providerRef;
      notification.sentAt = new Date();
      await notification.save();
    } catch (err) {
      notification.status = NotificationStatus.FAILED;
      notification.error = (err as Error).message;
      notification.attempts = (notification.attempts ?? 0) + 1;
      await notification.save();

      if (err instanceof NotificationDeliveryError && !err.retryable) {
        this.logger.warn(
          `Notification marked failed without retry: id=${notification._id.toString()} reason=${err.message}`,
        );
        return;
      }

      throw err; // surface retryable errors to BullMQ for backoff/retry
    }
  }
}
