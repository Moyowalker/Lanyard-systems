import { Module } from '@nestjs/common';
import { PricingService } from './application/pricing.service';
import { AdminPricingController } from './api/admin-pricing.controller';

@Module({
  controllers: [AdminPricingController],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
