import { Module } from '@nestjs/common';

import { VendorService } from './application/vendor.service';
import { AdminVendorController } from './api/admin-vendor.controller';

@Module({
  controllers: [AdminVendorController],
  providers: [VendorService],
  exports: [VendorService],
})
export class VendorModule {}
