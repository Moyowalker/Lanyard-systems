import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { OrderModule } from '../order/order.module';
import { PrescriptionService } from './application/prescription.service';
import { AvScannerService } from './application/av-scanner.service';
import { AvScanProcessor } from './jobs/av-scan.processor';
import { PrescriptionController } from './api/prescription.controller';
import { AdminPrescriptionController } from './api/admin-prescription.controller';
import { PRESCRIPTION_AV_QUEUE } from '../../core/queue/queue.constants';

/**
 * Prescriptions (PHI). Imports OrderModule to advance orders on an Rx decision and
 * registers the AV-scan queue (consumed by AvScanProcessor). Storage/audit come from
 * the global StorageModule/PlatformModule; the Redis connection from the global QueueModule.
 */
@Module({
  imports: [OrderModule, BullModule.registerQueue({ name: PRESCRIPTION_AV_QUEUE })],
  controllers: [PrescriptionController, AdminPrescriptionController],
  providers: [PrescriptionService, AvScannerService, AvScanProcessor],
})
export class PrescriptionModule {}
