import { z } from 'zod';
import { PaymentIntentStatus, PaymentProvider } from '../enums';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'must be a 24-char ObjectId');

export const InitPaymentSchema = z.object({
  orderId: objectId,
});
export type InitPaymentInput = z.infer<typeof InitPaymentSchema>;

export interface PaymentInitDto {
  intentId: string;
  reference: string;
  /** Provider-hosted checkout URL the client redirects to (or opens inline). */
  authorizationUrl: string;
  provider: PaymentProvider;
  amountKobo: number;
  currency: string;
}

export interface PaymentIntentDto {
  id: string;
  orderId: string;
  provider: PaymentProvider;
  reference: string;
  amountKobo: number;
  currency: string;
  status: PaymentIntentStatus;
}

export const RefundSchema = z.object({
  orderId: objectId,
  amountKobo: z.number().int().positive().optional(), // defaults to the full order total
  reason: z.string().trim().min(1).max(500),
});
export type RefundInput = z.infer<typeof RefundSchema>;

export interface RefundDto {
  id: string;
  orderId: string;
  amountKobo: number;
  currency: string;
  status: string;
  reason: string;
}
