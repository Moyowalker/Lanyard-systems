import { Module } from '@nestjs/common';

import { CatalogModule } from '../catalog/catalog.module';
import { OrderModule } from '../order/order.module';
import { PaymentModule } from '../payment/payment.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PricingModule } from '../pricing/pricing.module';
import { IdentityModule } from '../identity/identity.module';
import { PosService } from './application/pos.service';
import { AdminPosController } from './api/admin-pos.controller';

/**
 * Point-of-sale (counter sales). Thin orchestration over the existing order,
 * payment, and inventory pipeline so walk-in sales share the same ledger and
 * reports as online orders. Models come from the global ModelsModule.
 */
@Module({
  imports: [
    CatalogModule,
    OrderModule,
    PaymentModule,
    InventoryModule,
    PricingModule,
    IdentityModule,
  ],
  controllers: [AdminPosController],
  providers: [PosService],
})
export class PosModule {}
