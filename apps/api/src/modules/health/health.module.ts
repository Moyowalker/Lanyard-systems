import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { HealthController } from './health.controller';
import { NOTIFICATION_QUEUE } from '../../core/queue/queue.constants';

@Module({
  imports: [BullModule.registerQueue({ name: NOTIFICATION_QUEUE })],
  controllers: [HealthController],
})
export class HealthModule {}
