import { z } from 'zod';
import { AvScanStatus, RxStatus, VerificationDecision } from '../enums';

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

export const VerifyPrescriptionSchema = z.object({
  decision: z.nativeEnum(VerificationDecision),
  note: z.string().trim().max(1000).optional(),
});
export type VerifyPrescriptionInput = z.infer<typeof VerifyPrescriptionSchema>;

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
  linkedOrderIds: string[];
  createdAt: string;
}

/** Short-lived signed URL for a single PHI file. */
export interface SignedFileUrlDto {
  url: string;
  expiresInSeconds: number;
}
