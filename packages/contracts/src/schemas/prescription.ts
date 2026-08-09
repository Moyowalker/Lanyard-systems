import { z } from 'zod';
import { AvScanStatus, RxStatus, VerificationDecision } from '../enums';
import { BranchPaginationQuerySchema } from './common';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'must be a 24-char ObjectId');

// Prescriptions are PHI. Files are uploaded as multipart/form-data, stored in the
// encrypted object store (never in Mongo), AV-scanned by a worker, and only ever
// served via short-lived signed URLs whose issuance is audited (phi.view).
// The pharmacist verification gate is a regulatory hard-stop and additionally
// requires all files to be AV-clean before a decision can be made.

/** Allowed prescription upload content types. */
export const RX_ALLOWED_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

/** Non-file fields accompanying a multipart prescription upload. */
export const CreatePrescriptionMetaSchema = z.object({
  branchId: objectId,
  prescriberName: z.string().trim().max(160).optional(),
  prescriberRegNo: z.string().trim().max(80).optional(),
  prescriberHospital: z.string().trim().max(160).optional(),
});
export type CreatePrescriptionMetaInput = z.infer<typeof CreatePrescriptionMetaSchema>;

// A rejection must always carry a reason — it is shown to the customer and kept
// for the audit trail. An approval note stays optional.
export const VerifyPrescriptionSchema = z
  .object({
    decision: z.nativeEnum(VerificationDecision),
    note: z.string().trim().max(1000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.decision === VerificationDecision.REJECTED && !value.note?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['note'],
        message: 'A reason is required when declining a prescription',
      });
    }
  });
export type VerifyPrescriptionInput = z.infer<typeof VerifyPrescriptionSchema>;

export const RequestPrescriptionInfoSchema = z.object({
  note: z.string().trim().min(1).max(1000),
});
export type RequestPrescriptionInfoInput = z.infer<typeof RequestPrescriptionInfoSchema>;

export interface RxFileDto {
  fileId: string;
  mime: string;
  sizeBytes: number;
  avScan: AvScanStatus;
}

export interface PrescriptionDto {
  id: string;
  customerId: string;
  branchId: string;
  status: RxStatus;
  files: RxFileDto[];
  verification?: {
    pharmacistStaffId: string;
    pcnLicenseNo: string;
    decision: string;
    note?: string;
    at: string;
  };
  clarificationRequest?: {
    note: string;
    requestedByStaffId: string;
    requestedAt: string;
    respondedAt?: string;
  };
  linkedOrderIds: string[];
  createdAt: string;
}

/** Short-lived signed URL for a single PHI file. */
export interface SignedFileUrlDto {
  url: string;
  expiresInSeconds: number;
}

/* ── Staff prescription recall (dispute lookup) ──
 * Unlike the pharmacist work queue, this searches ALL statuses (including verified
 * and rejected) so a fulfilled order's prescription can be recalled during a dispute.
 * Images stay gated behind phi:view; this surfaces linkage + metadata only. */

export const PrescriptionAdminSearchQuerySchema = BranchPaginationQuerySchema.extend({
  /** Free-text: a customer phone (E.164) or an order number. */
  q: z.string().trim().max(120).optional(),
  status: z.nativeEnum(RxStatus).optional(),
});
export type PrescriptionAdminSearchQuery = z.infer<typeof PrescriptionAdminSearchQuerySchema>;

export interface PrescriptionAdminListItemDto {
  id: string;
  status: RxStatus;
  customerName?: string;
  customerPhone?: string;
  orderNos: string[];
  fileCount: number;
  createdAt: string;
}

/** Admin prescription detail — the customer-realm DTO plus staff dispute context. */
export interface AdminPrescriptionDetailDto extends PrescriptionDto {
  customer?: { id: string; name: string; phone: string };
  orders?: Array<{ id: string; orderNo: string; status: string; createdAt: string }>;
}
