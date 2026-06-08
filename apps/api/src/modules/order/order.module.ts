import { Module } from '@nestjs/common';

import { CartModule } from '../cart/cart.module';
import { InventoryModule } from '../inventory/inventory.module';
import { OrderService } from './application/order.service';
import { OrderController } from './api/order.controller';
import { AdminOrderController } from './api/admin-order.controller';

/**
 * Orders — the transactional core. Reads cart via CartModule; Branch/Prescription/Order
 * models come from the global ModelsModule; audit/transactions from the global
 * PlatformModule. Exports OrderService so the prescription module can advance orders
 * on an Rx decision.
 */
@Module({
  imports: [CartModule, InventoryModule],
  controllers: [OrderController, AdminOrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
