import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  ActorType,
  AvScanStatus,
  CreatePrescriptionMetaInput,
  ErrorCode,
  Paginated,
  PaginationQuery,
  PrescriptionDto,
  RequestPrescriptionInfoInput,
  RxStatus,
  SignedFileUrlDto,
  VerificationDecision,
  VerifyPrescriptionInput,
} from '@lanyard/contracts';

import { Prescription, PrescriptionDocument } from '../infrastructure/prescription.schema';
import { StaffUser } from '../../identity/infrastructure/identity.schemas';
import { OrderService } from '../../order/application/order.service';
import { NotificationService } from '../../notification/application/notification.service';
import { AuditService } from '../../../core/platform/audit.service';
import { StorageService } from '../../../core/storage/storage.service';
import { DomainError } from '../../../core/errors/domain-error';
import { AuthPrincipal } from '../../../core/auth/principal';
import { cursorFilter, paginate } from '../../../core/pagination/cursor';
import { AvScanJobData, PRESCRIPTION_AV_QUEUE } from '../../../core/queue/queue.constants';

/** A validated file received from the multipart upload. */
export interface UploadedRxFile {
  buffer: Buffer;
  mime: string;
  sizeBytes: number;
  ext: string;
}

interface RxFileSubdoc {
  _id: Types.ObjectId;
  objectKey: string;
  mime: string;
  sizeBytes: number;
  avScan: AvScanStatus;
}

@Injectable()
export class PrescriptionService {
  constructor(
    @InjectModel(Prescription.name) private readonly rxModel: Model<Prescription>,
    @InjectModel(StaffUser.name) private readonly staffModel: Model<StaffUser>,
    @InjectQueue(PRESCRIPTION_AV_QUEUE) private readonly avQueue: Queue<AvScanJobData>,
    private readonly orders: OrderService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  /** Upload prescription files to the encrypted object store, then enqueue an AV scan. */
  async create(
    customerId: string,
    meta: CreatePrescriptionMetaInput,
    files: UploadedRxFile[],
  ): Promise<PrescriptionDto> {
    if (files.length === 0) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'At least one file is required');
    }

    const rxId = new Types.ObjectId();
    const fileDocs = [];
    for (const file of files) {
      const objectKey = `prescriptions/${customerId}/${rxId.toString()}/${randomUUID()}.${file.ext}`;
      await this.storage.putObject(objectKey, file.buffer, file.mime);
      fileDocs.push({
        objectKey,
        mime: file.mime,
        sizeBytes: file.sizeBytes,
        avScan: AvScanStatus.PENDING,
        uploadedAt: new Date(),
      });
    }

    const rx = await this.rxModel.create({
      _id: rxId,
      customerId: new Types.ObjectId(customerId),
      branchId: new Types.ObjectId(meta.branchId),
      files: fileDocs,
      status: RxStatus.PENDING,
      prescriber:
        meta.prescriberName || meta.prescriberRegNo || meta.prescriberHospital
          ? {
              name: meta.prescriberName,
              regNo: meta.prescriberRegNo,
              hospital: meta.prescriberHospital,
            }
          : undefined,
    });

    await this.avQueue.add('scan', { prescriptionId: rxId.toString() }, { removeOnComplete: true });
    return this.toDto(rx);
  }

  async listMine(customerId: string, query: PaginationQuery): Promise<Paginated<PrescriptionDto>> {
    const rows = await this.rxModel
      .find({ customerId: new Types.ObjectId(customerId), ...cursorFilter(query.cursor) })
      .sort({ _id: 1 })
      .limit(query.limit + 1);
    return paginate(
      rows.map((r) => this.toDto(r)),
      query.limit,
    );
  }

  async getMine(customerId: string, id: string): Promise<PrescriptionDto> {
    const rx = await this.rxModel.findOne({ _id: id, customerId: new Types.ObjectId(customerId) });
    if (!rx) throw new DomainError(ErrorCode.NOT_FOUND, 'Prescription not found');
    return this.toDto(rx);
  }

  /** Customer signed URL for one of their own Rx files — audited as PHI access. */
  async getMyFileUrl(
    principal: AuthPrincipal,
    id: string,
    fileId: string,
  ): Promise<SignedFileUrlDto> {
    const rx = await this.rxModel.findOne({
      _id: id,
      customerId: new Types.ObjectId(principal.sub),
    });
    if (!rx) throw new DomainError(ErrorCode.NOT_FOUND, 'Prescription not found');
    return this.issueFileUrl(rx, fileId, principal, ActorType.CUSTOMER);
  }

  async addFiles(
    customerId: string,
    id: string,
    files: UploadedRxFile[],
  ): Promise<PrescriptionDto> {
    if (files.length === 0) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'At least one file is required');
    }
    const rx = await this.rxModel.findOne({ _id: id, customerId: new Types.ObjectId(customerId) });
    if (!rx) throw new DomainError(ErrorCode.NOT_FOUND, 'Prescription not found');
    if (rx.status !== RxStatus.NEEDS_INFO) {
      throw new DomainError(
        ErrorCode.CONFLICT,
        'This prescription is not awaiting more information',
      );
    }

    const fileDocs = [];
    for (const file of files) {
      const objectKey = `prescriptions/${customerId}/${rx._id.toString()}/${randomUUID()}.${file.ext}`;
      await this.storage.putObject(objectKey, file.buffer, file.mime);
      fileDocs.push({
        objectKey,
        mime: file.mime,
        sizeBytes: file.sizeBytes,
        avScan: AvScanStatus.PENDING,
        uploadedAt: new Date(),
      });
    }

    rx.files.push(...fileDocs);
    rx.status = RxStatus.PENDING;
    if (rx.clarificationRequest) rx.clarificationRequest.respondedAt = new Date();
    await rx.save();
    await this.avQueue.add(
      'scan',
      { prescriptionId: rx._id.toString() },
      { removeOnComplete: true },
    );
    await this.audit.record({
      actorId: customerId,
      actorType: ActorType.CUSTOMER,
      action: 'rx.clarification_submitted',
      targetType: 'prescription',
      targetId: rx._id.toString(),
      branchId: rx.branchId.toString(),
      metadata: { filesAdded: fileDocs.length },
    });
    return this.toDto(rx);
  }

  /* ── pharmacist (staff) ── */

  async queue(branchScope: string[], query: PaginationQuery): Promise<Paginated<PrescriptionDto>> {
    const filter: Record<string, unknown> = {
      status: { $in: [RxStatus.PENDING, RxStatus.UNDER_REVIEW, RxStatus.NEEDS_INFO] },
      ...cursorFilter(query.cursor),
    };
    if (!branchScope.includes('ALL')) {
      filter.branchId = { $in: branchScope.map((id) => new Types.ObjectId(id)) };
    }
    const rows = await this.rxModel
      .find(filter)
      .sort({ _id: 1 })
      .limit(query.limit + 1);
    return paginate(
      rows.map((r) => this.toDto(r)),
      query.limit,
    );
  }

  async adminGet(branchScope: string[], id: string): Promise<PrescriptionDto> {
    const rx = await this.rxModel.findById(id);
    if (!rx) throw new DomainError(ErrorCode.NOT_FOUND, 'Prescription not found');
    this.assertBranchScope(branchScope, rx.branchId.toString());
    return this.toDto(rx);
  }

  /** Staff signed URL for a prescription image (requires phi:view) — audited. */
  async getAdminFileUrl(
    principal: AuthPrincipal,
    id: string,
    fileId: string,
  ): Promise<SignedFileUrlDto> {
    const rx = await this.rxModel.findById(id);
    if (!rx) throw new DomainError(ErrorCode.NOT_FOUND, 'Prescription not found');
    this.assertBranchScope(principal.branchScope, rx.branchId.toString());
    return this.issueFileUrl(rx, fileId, principal, ActorType.STAFF);
  }

  /**
   * Pharmacist verification — the regulatory hard-stop. Requires a valid, in-date PCN
   * license at action time, all files AV-clean, enforces branch scope, is audited, and
   * advances any orders blocked on this prescription.
   */
  async verify(
    principal: AuthPrincipal,
    id: string,
    dto: VerifyPrescriptionInput,
  ): Promise<PrescriptionDto> {
    const staff = await this.staffModel.findById(principal.sub);
    const license = staff?.pharmacist;
    if (!license || !license.pcnLicenseNo || license.licenseExpiry.getTime() < Date.now()) {
      throw new DomainError(
        ErrorCode.FORBIDDEN,
        'A valid, in-date PCN pharmacist license is required to verify prescriptions',
      );
    }

    const rx = await this.rxModel.findById(id);
    if (!rx) throw new DomainError(ErrorCode.NOT_FOUND, 'Prescription not found');
    this.assertBranchScope(principal.branchScope, rx.branchId.toString());
    if (rx.status !== RxStatus.PENDING && rx.status !== RxStatus.UNDER_REVIEW) {
      throw new DomainError(ErrorCode.CONFLICT, `Prescription already ${rx.status}`);
    }
    // AV gate: every file must be scanned clean before a pharmacist can act.
    if (rx.files.some((f) => f.avScan !== AvScanStatus.CLEAN)) {
      throw new DomainError(
        ErrorCode.CONFLICT,
        'All prescription files must pass an AV scan before verification',
      );
    }

    rx.status =
      dto.decision === VerificationDecision.VERIFIED ? RxStatus.VERIFIED : RxStatus.REJECTED;
    rx.verification = {
      pharmacistStaffId: staff!._id,
      pcnLicenseNo: license.pcnLicenseNo,
      decision: dto.decision,
      note: dto.note,
      at: new Date(),
    };
    await rx.save();

    await this.audit.record({
      actorId: principal.sub,
      actorType: ActorType.STAFF,
      action: 'rx.verify',
      targetType: 'prescription',
      targetId: rx._id.toString(),
      branchId: rx.branchId.toString(),
      metadata: { decision: dto.decision, pcnLicenseNo: license.pcnLicenseNo },
    });

    await this.orders.handleRxDecision(rx._id.toString(), dto.decision, {
      id: principal.sub,
      role: principal.roles[0],
      type: ActorType.STAFF,
    });

    await this.notifications.notifyRxEvent(
      rx._id.toString(),
      dto.decision === VerificationDecision.VERIFIED ? 'rx.verified' : 'rx.rejected',
    );

    return this.toDto(rx);
  }

  async requestInfo(
    principal: AuthPrincipal,
    id: string,
    dto: RequestPrescriptionInfoInput,
  ): Promise<PrescriptionDto> {
    const rx = await this.rxModel.findById(id);
    if (!rx) throw new DomainError(ErrorCode.NOT_FOUND, 'Prescription not found');
    this.assertBranchScope(principal.branchScope, rx.branchId.toString());
    if (rx.status !== RxStatus.PENDING && rx.status !== RxStatus.UNDER_REVIEW) {
      throw new DomainError(ErrorCode.CONFLICT, `Prescription already ${rx.status}`);
    }

    rx.status = RxStatus.NEEDS_INFO;
    rx.clarificationRequest = {
      note: dto.note,
      requestedByStaffId: new Types.ObjectId(principal.sub),
      requestedAt: new Date(),
    };
    await rx.save();
    await this.audit.record({
      actorId: principal.sub,
      actorType: ActorType.STAFF,
      action: 'rx.request_info',
      targetType: 'prescription',
      targetId: rx._id.toString(),
      branchId: rx.branchId.toString(),
    });
    await this.notifications.notifyRxEvent(rx._id.toString(), 'rx.needs_info');
    return this.toDto(rx);
  }

  /* ── helpers ── */

  private async issueFileUrl(
    rx: PrescriptionDocument,
    fileId: string,
    principal: AuthPrincipal,
    actorType: ActorType,
  ): Promise<SignedFileUrlDto> {
    const file = (rx.files as unknown as RxFileSubdoc[]).find((f) => f._id.toString() === fileId);
    if (!file) throw new DomainError(ErrorCode.NOT_FOUND, 'File not found');

    const url = await this.storage.getSignedDownloadUrl(file.objectKey);
    await this.audit.record({
      actorId: principal.sub,
      actorType,
      action: 'phi.view',
      targetType: 'prescription',
      targetId: rx._id.toString(),
      branchId: rx.branchId.toString(),
      metadata: { fileId, objectKey: file.objectKey },
    });
    return { url, expiresInSeconds: this.storage.signedUrlTtl };
  }

  private assertBranchScope(branchScope: string[], branchId: string): void {
    if (!branchScope.includes('ALL') && !branchScope.includes(branchId)) {
      throw new DomainError(ErrorCode.BRANCH_SCOPE_VIOLATION, 'Outside your branch scope');
    }
  }

  private toDto(rx: PrescriptionDocument): PrescriptionDto {
    return {
      id: rx._id.toString(),
      customerId: rx.customerId.toString(),
      branchId: rx.branchId.toString(),
      status: rx.status,
      files: (rx.files as unknown as RxFileSubdoc[]).map((f) => ({
        fileId: f._id.toString(),
        mime: f.mime,
        sizeBytes: f.sizeBytes,
        avScan: f.avScan,
      })),
      verification: rx.verification
        ? {
            pharmacistStaffId: rx.verification.pharmacistStaffId.toString(),
            pcnLicenseNo: rx.verification.pcnLicenseNo,
            decision: rx.verification.decision,
            note: rx.verification.note,
            at: rx.verification.at.toISOString(),
          }
        : undefined,
      clarificationRequest: rx.clarificationRequest
        ? {
            note: rx.clarificationRequest.note,
            requestedByStaffId: rx.clarificationRequest.requestedByStaffId.toString(),
            requestedAt: rx.clarificationRequest.requestedAt.toISOString(),
            respondedAt: rx.clarificationRequest.respondedAt?.toISOString(),
          }
        : undefined,
      linkedOrderIds: rx.linkedOrderIds.map(String),
      createdAt: (rx as unknown as { createdAt: Date }).createdAt.toISOString(),
    };
  }
}
