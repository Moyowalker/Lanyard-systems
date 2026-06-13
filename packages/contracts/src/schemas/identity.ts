import { z } from 'zod';

// Customer self-service: profile, saved addresses, and email verification. The API
// validates against these exact schemas; the store imports them for client validation.

const phone = z.string().regex(/^\+[1-9]\d{6,14}$/, 'phone must be E.164, e.g. +2348012345678');

/* ── Saved addresses ── */

export const CustomerAddressSchema = z.object({
  label: z.string().trim().max(40).optional(),
  line1: z.string().trim().min(1).max(120),
  line2: z.string().trim().max(120).optional(),
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().min(1).max(80),
  country: z.string().trim().length(2).default('NG'),
  landmark: z.string().trim().max(120).optional(),
  contactPhone: phone.optional(),
});
export type CustomerAddressInput = z.infer<typeof CustomerAddressSchema>;

/** Replace the whole address list (simplest correct op for embedded subdocs). */
export const ReplaceAddressesSchema = z.object({
  addresses: z.array(CustomerAddressSchema).max(10),
});
export type ReplaceAddressesInput = z.infer<typeof ReplaceAddressesSchema>;

/* ── Profile ── */

export const UpdateCustomerProfileSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: z.string().trim().min(1).max(80).optional(),
    email: z.string().email().max(120).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });
export type UpdateCustomerProfileInput = z.infer<typeof UpdateCustomerProfileSchema>;

/* ── Email verification (OTP over the email channel) ── */

export const EmailVerifyConfirmSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'code must be 6 digits'),
});
export type EmailVerifyConfirmInput = z.infer<typeof EmailVerifyConfirmSchema>;

/* ── Response shapes ── */

export interface CustomerAddressDto {
  label?: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  country: string;
  landmark?: string;
  contactPhone?: string;
}

export interface CustomerProfileDto {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  phoneVerified: boolean;
  email?: string;
  emailVerified: boolean;
  marketingConsent: boolean;
  addresses: CustomerAddressDto[];
}
