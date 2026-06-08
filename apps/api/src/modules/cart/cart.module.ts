import { Module } from '@nestjs/common';

import { PricingModule } from '../pricing/pricing.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CartService } from './application/cart.service';
import { CartController } from './api/cart.controller';

@Module({
  imports: [PricingModule, InventoryModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
