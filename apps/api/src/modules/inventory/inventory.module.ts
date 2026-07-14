import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { AdminInventoryController } from './api/admin-inventory.controller';
import { InventoryService } from './application/inventory.service';
import { ExpiryDigestProcessor } from './jobs/expiry-digest.processor';
import { NotificationModule } from '../notification/notification.module';
import { EXPIRY_DIGEST_QUEUE } from '../../core/queue/queue.constants';

@Module({
  // NotificationModule is @Global but is imported explicitly here because the expiry
  // digest depends on its exported EmailChannel (not just NotificationService).
  imports: [BullModule.registerQueue({ name: EXPIRY_DIGEST_QUEUE }), NotificationModule],
  controllers: [AdminInventoryController],
  providers: [InventoryService, ExpiryDigestProcessor],
  exports: [InventoryService],
})
export class InventoryModule {}
