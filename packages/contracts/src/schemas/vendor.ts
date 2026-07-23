import { z } from 'zod';

import { PaginationQuerySchema } from './common';

/* ── Vendor registry ──
 * Suppliers a branch receives stock from. Referenced by stock invoices via a
 * `vendorId` while each invoice also snapshots `vendorName` (so historical rows
 * stay readable if a vendor is later renamed). */

const E164 = /^\+[1-9]\d{6,14}$/;

export const CreateVendorSchema = z.object({
  name: z.string().trim().min(1).max(160),
  contactName: z.string().trim().max(160).optional(),
  phone: z
    .string()
    .trim()
    .regex(E164, 'phone must be in international format, e.g. +2348012345678')
    .optional(),
  email: z.string().trim().email().max(200).optional(),
  address: z.string().trim().max(300).optional(),
  note: z.string().trim().max(500).optional(),
  isActive: z.boolean().default(true),
});
export type CreateVendorInput = z.infer<typeof CreateVendorSchema>;

export const UpdateVendorSchema = CreateVendorSchema.partial();
export type UpdateVendorInput = z.infer<typeof UpdateVendorSchema>;

/** Vendor list query — pagination plus a case-insensitive name search. */
export const VendorQuerySchema = PaginationQuerySchema.extend({
  q: z.string().trim().max(160).optional(),
});
export type VendorQuery = z.infer<typeof VendorQuerySchema>;

export interface VendorDto {
  id: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  note?: string;
  isActive: boolean;
  createdAt: string;
}
