import { z } from 'zod';
import { BranchStatus, FulfillmentType } from '../enums';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'must be a 24-char ObjectId');

/* ── Queries ── */

export const BranchLocatorQuerySchema = z.object({
  // "lat,lng" — when present, results are sorted by proximity.
  near: z
    .string()
    .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, 'near must be "lat,lng"')
    .optional(),
  service: z.nativeEnum(FulfillmentType).optional(),
});
export type BranchLocatorQuery = z.infer<typeof BranchLocatorQuerySchema>;

/* ── Admin write ── */

const addressSchema = z.object({
  line1: z.string().trim().min(1),
  line2: z.string().trim().optional(),
  city: z.string().trim().min(1),
  state: z.string().trim().min(1),
  country: z.string().trim().default('NG'),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const hoursSchema = z.object({
  day: z.number().int().min(0).max(6),
  open: z.string().regex(/^\d{2}:\d{2}$/),
  close: z.string().regex(/^\d{2}:\d{2}$/),
  closed: z.boolean().optional(),
});

const deliveryZoneSchema = z.object({
  name: z.string().trim().min(1),
  radiusKm: z.number().min(0).optional(),
  feeKobo: z.number().int().min(0),
  etaMins: z.number().int().min(0).optional(),
});

const fulfillmentSchema = z.object({
  pickup: z.boolean().default(true),
  delivery: z.boolean().default(false),
  deliveryZones: z.array(deliveryZoneSchema).default([]),
});

export const CreateBranchSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(160),
  status: z.nativeEnum(BranchStatus).default(BranchStatus.INACTIVE),
  address: addressSchema,
  contact: z
    .object({ phone: z.string().optional(), email: z.string().email().optional() })
    .optional(),
  superintendentStaffId: objectId,
  pcnPremisesNo: z.string().trim().min(1),
  hours: z.array(hoursSchema).default([]),
  fulfillment: fulfillmentSchema.optional(),
});
export type CreateBranchInput = z.infer<typeof CreateBranchSchema>;

export const UpdateBranchSchema = CreateBranchSchema.partial();
export type UpdateBranchInput = z.infer<typeof UpdateBranchSchema>;

/* ── Response shapes ── */

export interface BranchSummaryDto {
  id: string;
  code: string;
  name: string;
  status: string;
  address: { line1: string; city: string; state: string; lat: number; lng: number };
  fulfillment: {
    pickup: boolean;
    delivery: boolean;
    deliveryZones?: Array<{ name: string; feeKobo: number; etaMins?: number; radiusKm?: number }>;
  };
  distanceKm?: number; // present when ?near= supplied
}
