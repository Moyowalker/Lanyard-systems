import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  ActorType,
  AdminPrescriptionDetailDto,
  AvScanStatus,
  CreatePrescriptionMetaInput,
  ErrorCode,
  Paginated,
  PaginationQuery,
  PrescriptionAdminListItemDto,
  PrescriptionAdminSearchQuery,
  PrescriptionDto,
  RequestPrescriptionInfoInput,
  RxStatus,
  SignedFileUrlDto,
  VerificationDecision,
  VerifyPrescriptionInput,
} from '@lanyard/contracts';

import { Prescription, PrescriptionDocument } from '../infrastructure/prescription.schema';
import { Customer, StaffUser } from '../../identity/infrastructure/identity.schemas';
import { Order } from '../../order/infrastructure/order.schema';
import { OrderService } from '../../order/application/order.service';
import { NotificationService } from '../../notification/application/notification.service';
import { AuditService } from '../../../core/platform/audit.service';
import { StorageService } from '../../../core/storage/storage.service';
import { DomainError } from '../../../core/errors/domain-error';
import { AuthPrincipal } from '../../../core/auth/principal';
import { cursorFilter, cursorFilterDesc, paginate } from '../../../core/pagination/cursor';
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
  private readonly logger = new Logger(PrescriptionService.name);

  /**
   * Persist uploaded files to the object store, surfacing storage misconfiguration
   * (missing/invalid S3 creds or bucket) as a clear error instead of an opaque 500.
   */
  private async storeFiles(
    customerId: string,
    rxId: Types.ObjectId,
    files: UploadedRxFile[],
  ): Promise<
    Array<{
      objectKey: string;
      mime: string;
      sizeBytes: number;
      avScan: AvScanStatus;
      uploadedAt: Date;
    }>
  > {
    const fileDocs = [];
    for (const file of files) {
      const objectKey = `prescriptions/${customerId}/${rxId.toString()}/${randomUUID()}.${file.ext}`;
      try {
        await this.storage.putObject(objectKey, file.buffer, file.mime);
      } catch (err) {
        this.logger.error(
          `Prescription file upload to object storage failed (key=${objectKey}): ${
            err instanceof Error ? err.message : String(err)
          }`,
          err instanceof Error ? err.stack : undefined,
        );
        throw new DomainError(
          ErrorCode.INTERNAL,
          'We could not store your prescription right now. Please try again shortly.',
        );
      }
      fileDocs.push({
        objectKey,
        mime: file.mime,
        sizeBytes: file.sizeBytes,
        avScan: AvScanStatus.PENDING,
        uploadedAt: new Date(),
      });
    }
    return fileDocs;
  }

  constructor(
    @InjectModel(Prescription.name) private readonly rxModel: Model<Prescription>,
    @InjectModel(StaffUser.name) private readonly staffModel: Model<StaffUser>,
    @InjectModel(Customer.name) private readonly customerModel: Model<Customer>,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
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
    const fileDocs = await this.storeFiles(customerId, rxId, files);

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

    const fileDocs = await this.storeFiles(customerId, rx._id, files);

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

  async adminGet(branchScope: string[], id: string): Promise<AdminPrescriptionDetailDto> {
    const rx = await this.rxModel.findById(id);
    if (!rx) throw new DomainError(ErrorCode.NOT_FOUND, 'Prescription not found');
    this.assertBranchScope(branchScope, rx.branchId.toString());

    // Enrich with dispute context: the customer and the orders this Rx is linked to.
    const [customer, orders] = await Promise.all([
      this.customerModel
        .findById(rx.customerId)
        .select('firstName lastName phone')
        .lean<{
          _id: Types.ObjectId;
          firstName?: string;
          lastName?: string;
          phone: string;
        } | null>(),
      rx.linkedOrderIds.length
        ? this.orderModel
            .find({ _id: { $in: rx.linkedOrderIds } })
            .select('orderNo status createdAt')
            .lean<
              Array<{ _id: Types.ObjectId; orderNo: string; status: string; createdAt?: Date }>
            >()
        : Promise.resolve([]),
    ]);

    return {
      ...this.toDto(rx),
      customer: customer
        ? {
            id: customer._id.toString(),
            name: [customer.firstName, customer.lastName].filter(Boolean).join(' '),
            phone: customer.phone,
          }
        : undefined,
      orders: orders.map((o) => ({
        id: o._id.toString(),
        orderNo: o.orderNo,
        status: o.status,
        createdAt: o.createdAt?.toISOString() ?? new Date().toISOString(),
      })),
    };
  }

  /**
   * Staff prescription recall for disputes: search ALL statuses (unlike the pharmacist
   * queue) by customer phone or order number, so a fulfilled order's prescription can be
   * retrieved. Returns linkage + metadata only — the image stays behind phi:view.
   */
  async searchAdmin(
    branchScope: string[],
    query: PrescriptionAdminSearchQuery,
  ): Promise<Paginated<PrescriptionAdminListItemDto>> {
    const filter: Record<string, unknown> = { ...cursorFilterDesc(query.cursor) };
    if (!branchScope.includes('ALL')) {
      filter.branchId = { $in: branchScope.map((id) => new Types.ObjectId(id)) };
    }
    if (query.status) filter.status = query.status;

    if (query.q) {
      const q = query.q.trim();
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const [customers, order] = await Promise.all([
        this.customerModel
          .find({ phone: new RegExp(escaped, 'i') })
          .select('_id')
          .limit(25)
          .lean<Array<{ _id: Types.ObjectId }>>(),
        this.orderModel
          .findOne({ orderNo: new RegExp(`^${escaped}$`, 'i') })
          .select('_id prescriptionIds')
          .lean<{ _id: Types.ObjectId; prescriptionIds?: Types.ObjectId[] } | null>(),
      ]);

      const or: Record<string, unknown>[] = [];
      if (customers.length) or.push({ customerId: { $in: customers.map((c) => c._id) } });
      if (order) {
        or.push({ _id: { $in: order.prescriptionIds ?? [] } });
        or.push({ linkedOrderIds: order._id });
      }
      if (or.length === 0) return { data: [], meta: { nextCursor: null } };
      filter.$or = or;
    }

    const rows = await this.rxModel
      .find(filter)
      .sort({ _id: -1 })
      .limit(query.limit + 1);

    const items = await this.toSearchItems(rows);
    return paginate(items, query.limit);
  }

  /** Enrich prescription docs with customer name/phone + linked order numbers. */
  private async toSearchItems(
    rows: PrescriptionDocument[],
  ): Promise<PrescriptionAdminListItemDto[]> {
    if (rows.length === 0) return [];
    const customerIds = [...new Set(rows.map((r) => r.customerId.toString()))];
    const orderIds = [...new Set(rows.flatMap((r) => r.linkedOrderIds.map(String)))];

    const [customers, orders] = await Promise.all([
      this.customerModel
        .find({ _id: { $in: customerIds.map((id) => new Types.ObjectId(id)) } })
        .select('firstName lastName phone')
        .lean<
          Array<{ _id: Types.ObjectId; firstName?: string; lastName?: string; phone: string }>
        >(),
      orderIds.length
        ? this.orderModel
            .find({ _id: { $in: orderIds.map((id) => new Types.ObjectId(id)) } })
            .select('orderNo')
            .lean<Array<{ _id: Types.ObjectId; orderNo: string }>>()
        : Promise.resolve([]),
    ]);
    const customerById = new Map(customers.map((c) => [c._id.toString(), c]));
    const orderNoById = new Map(orders.map((o) => [o._id.toString(), o.orderNo]));

    return rows.map((rx) => {
      const customer = customerById.get(rx.customerId.toString());
      return {
        id: rx._id.toString(),
        status: rx.status,
        customerName: customer
          ? [customer.firstName, customer.lastName].filter(Boolean).join(' ')
          : undefined,
        customerPhone: customer?.phone,
        orderNos: rx.linkedOrderIds
          .map((id) => orderNoById.get(id.toString()))
          .filter((no): no is string => Boolean(no)),
        fileCount: (rx.files as unknown as unknown[]).length,
        createdAt: (rx as unknown as { createdAt: Date }).createdAt.toISOString(),
      };
    });
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
