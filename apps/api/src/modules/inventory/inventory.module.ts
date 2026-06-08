import { Module } from '@nestjs/common';

import { AdminInventoryController } from './api/admin-inventory.controller';
import { InventoryService } from './application/inventory.service';

@Module({
  controllers: [AdminInventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
