import { z } from 'zod';
import { DeliveryStatus } from '../enums';

// Staff delivery dispatch. MVP = manual dispatch + status updates (no rider app / GPS).
// Status actions drive the order through its existing state machine on the server.

const phone = z.string().regex(/^\+[1-9]\d{6,14}$/, 'phone must be E.164, e.g. +2348012345678');

export const DispatchDeliverySchema = z.object({
  riderName: z.string().trim().min(1).max(80),
  riderPhone: phone.optional(),
  vehicle: z.string().trim().max(60).optional(),
  note: z.string().trim().max(280).optional(),
});
export type DispatchDeliveryInput = z.infer<typeof DispatchDeliverySchema>;

/** The staff-driven delivery transitions (a safe subset of DeliveryStatus). */
export const DeliveryActionSchema = z.object({
  action: z.enum(['out_for_delivery', 'delivered', 'failed']),
  note: z.string().trim().max(280).optional(),
});
export type DeliveryActionInput = z.infer<typeof DeliveryActionSchema>;

export interface DeliveryRiderDto {
  name?: string;
  phone?: string;
  vehicle?: string;
}

export interface DeliveryTrackingDto {
  status: DeliveryStatus;
  note?: string;
  at: string;
}

export interface DeliveryDto {
  id: string;
  orderId: string;
  status: DeliveryStatus;
  rider?: DeliveryRiderDto;
  feeKobo: number;
  dispatchedAt?: string;
  deliveredAt?: string;
  trackingEvents: DeliveryTrackingDto[];
}

export interface DeliveryBoardItemDto {
  orderId: string;
  orderNo: string;
  orderStatus: string;
  totalKobo: number;
  deliveryFeeKobo: number;
  etaMins?: number;
  address?: { line1: string; city: string; state: string };
  createdAt: string;
  delivery?: DeliveryDto;
}

export interface DeliveryBoardDto {
  data: DeliveryBoardItemDto[];
}
