import { Module } from '@nestjs/common';

import { OrderModule } from '../order/order.module';
import { DeliveryService } from './application/delivery.service';
import { AdminDeliveryController } from './api/admin-delivery.controller';

/**
 * Delivery dispatch. Imports OrderModule to drive order transitions through the existing,
 * tested OrderService (no new state/stock logic). Models come from the global ModelsModule;
 * audit from the global PlatformModule.
 */
@Module({
  imports: [OrderModule],
  controllers: [AdminDeliveryController],
  providers: [DeliveryService],
})
export class DeliveryModule {}
