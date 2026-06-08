import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Job } from 'bullmq';
import { ActorType, AvScanStatus, RxStatus } from '@lanyard/contracts';

import { Prescription } from '../infrastructure/prescription.schema';
import { StorageService } from '../../../core/storage/storage.service';
import { AuditService } from '../../../core/platform/audit.service';
import { AvScannerService } from '../application/av-scanner.service';
import { AvScanJobData, PRESCRIPTION_AV_QUEUE } from '../../../core/queue/queue.constants';

/**
 * Scans uploaded prescription files. Any infected file auto-rejects the prescription
 * (it can never be verified/dispensed). Every scan is audited. Verification is blocked
 * until all files are CLEAN (enforced in PrescriptionService.verify).
 */
@Processor(PRESCRIPTION_AV_QUEUE)
export class AvScanProcessor extends WorkerHost {
  private readonly logger = new Logger(AvScanProcessor.name);

  constructor(
    @InjectModel(Prescription.name) private readonly rxModel: Model<Prescription>,
    private readonly storage: StorageService,
    private readonly scanner: AvScannerService,
    private readonly audit: AuditService,
  ) {
    super();
  }

  async process(job: Job<AvScanJobData>): Promise<void> {
    const rx = await this.rxModel.findById(job.data.prescriptionId);
    if (!rx) return;

    let infected = false;
    for (const file of rx.files) {
      if (file.avScan !== AvScanStatus.PENDING) continue;
      try {
        const buffer = await this.storage.getObjectBuffer(file.objectKey);
        file.avScan = this.scanner.scan(buffer);
      } catch (err) {
        this.logger.error(`Scan failed for ${file.objectKey}: ${(err as Error).message}`);
        file.avScan = AvScanStatus.INFECTED; // fail closed — never treat an unscannable file as clean
      }
      if (file.avScan === AvScanStatus.INFECTED) infected = true;
    }

    if (infected) rx.status = RxStatus.REJECTED; // auto-reject; cannot proceed to dispensing
    await rx.save();

    await this.audit.record({
      actorType: ActorType.SYSTEM,
      action: 'rx.av_scan',
      targetType: 'prescription',
      targetId: rx._id.toString(),
      branchId: rx.branchId.toString(),
      metadata: { infected, files: rx.files.map((f) => f.avScan) },
    });
  }
}
