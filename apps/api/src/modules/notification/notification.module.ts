import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { NotificationService } from './application/notification.service';
import { EmailChannel } from './application/channels/email.channel';
import { SmsChannel } from './application/channels/sms.channel';
import { NotificationProcessor } from './jobs/notification.processor';
import { NOTIFICATION_QUEUE } from '../../core/queue/queue.constants';

/**
 * Notifications. @Global so domain services can inject NotificationService without
 * importing this module. Registers the BullMQ queue consumed by NotificationProcessor;
 * models come from the global ModelsModule, Redis connection from the global QueueModule.
 */
@Global()
@Module({
  imports: [BullModule.registerQueue({ name: NOTIFICATION_QUEUE })],
  providers: [NotificationService, EmailChannel, SmsChannel, NotificationProcessor],
  exports: [NotificationService],
})
export class NotificationModule {}
