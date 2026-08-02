import { z } from 'zod';
import { DeliveryStatus } from '../enums';
import { optionalPhoneSchema } from './phone';

// Staff delivery dispatch. MVP = manual dispatch + status updates (no rider app / GPS).
// Status actions drive the order through its existing state machine on the server.

export const DispatchDeliverySchema = z.object({
  riderName: z.string().trim().min(1).max(80),
  riderPhone: optionalPhoneSchema,
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
  /** Customer's delivery instructions captured at checkout. */
  deliveryNote?: string;
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
  /** Customer's delivery instructions captured at checkout. */
  deliveryNote?: string;
  createdAt: string;
  delivery?: DeliveryDto;
}

export interface DeliveryBoardDto {
  data: DeliveryBoardItemDto[];
}
