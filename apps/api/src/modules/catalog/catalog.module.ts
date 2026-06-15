import { Module } from '@nestjs/common';

import { PricingModule } from '../pricing/pricing.module';
import { InventoryModule } from '../inventory/inventory.module';
import { BulkMedicineImportService } from './application/bulk-medicine-import.service';
import { CatalogService } from './application/catalog.service';
import { CatalogController } from './api/catalog.controller';
import { AdminCatalogController } from './api/admin-catalog.controller';

@Module({
  imports: [PricingModule, InventoryModule],
  controllers: [CatalogController, AdminCatalogController],
  providers: [CatalogService, BulkMedicineImportService],
  exports: [CatalogService],
})
export class CatalogModule {}
