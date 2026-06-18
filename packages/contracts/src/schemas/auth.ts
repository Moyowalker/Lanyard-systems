import { z } from 'zod';
import { OtpPurpose } from '../enums';

// Shared request/response contracts for authentication. The API validates against
// these exact schemas; frontends import the same schemas for client-side validation.

const phone = z.string().regex(/^\+[1-9]\d{6,14}$/, 'phone must be E.164, e.g. +2348012345678');

const otpCode = z.string().regex(/^\d{6}$/, 'OTP must be 6 digits');

/* ── Customer (phone + OTP) ── */

export const CustomerRegisterSchema = z.object({
  phone,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().email().optional(),
  marketingConsent: z.boolean().optional(),
});
export type CustomerRegisterInput = z.infer<typeof CustomerRegisterSchema>;

export const OtpRequestSchema = z.object({
  phone,
  purpose: z.nativeEnum(OtpPurpose).default(OtpPurpose.LOGIN),
});
export type OtpRequestInput = z.infer<typeof OtpRequestSchema>;

export const OtpVerifySchema = z.object({
  phone,
  code: otpCode,
  purpose: z.nativeEnum(OtpPurpose).default(OtpPurpose.LOGIN),
});
export type OtpVerifyInput = z.infer<typeof OtpVerifySchema>;

/* ── Staff (email + password + MFA) ── */

export const StaffLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type StaffLoginInput = z.infer<typeof StaffLoginSchema>;

export const StaffMfaVerifySchema = z.object({
  mfaToken: z.string().min(10),
  code: z.string().regex(/^\d{6,8}$/, 'MFA code must be 6-8 digits'),
});
export type StaffMfaVerifyInput = z.infer<typeof StaffMfaVerifySchema>;

/* ── Shared ── */

export const RefreshSchema = z.object({
  refreshToken: z.string().min(10),
});
export type RefreshInput = z.infer<typeof RefreshSchema>;

/** Staff must rotate their password at least this often (policy). */
export const STAFF_PASSWORD_MAX_AGE_DAYS = 90;

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z
      .string()
      .min(8, 'must be at least 8 characters')
      .max(128)
      .regex(/[A-Za-z]/, 'must include a letter')
      .regex(/\d/, 'must include a number'),
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ['newPassword'],
    message: 'must differ from your current password',
  });
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

/* ── Response shapes ── */

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number; // access token lifetime, seconds
}

export interface MfaChallenge {
  mfaRequired: true;
  mfaToken: string;
}

export interface MeResponse {
  id: string;
  realm: 'customer' | 'staff';
  roles: string[];
  permissions: string[];
  branchScope: string[];
  profile: { firstName?: string; lastName?: string; email?: string; phone?: string };
  /** Staff only: their password is past the rotation policy and must be changed. */
  mustChangePassword?: boolean;
}
