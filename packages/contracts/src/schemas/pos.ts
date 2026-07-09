import { z } from 'zod';
import { PaymentChannel } from '../enums';

// Point-of-sale (counter) sales. A cashier rings up a walk-in customer in the admin
// console; the sale is recorded as a normal order (fulfillment type "counter") that is
// paid offline and completed (stock dispensed) in one transaction, so it flows into the
// same inventory ledger and reports as online orders.

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'must be a 24-char ObjectId');
const phone = z.string().regex(/^\+[1-9]\d{6,14}$/, 'phone must be E.164, e.g. +2348012345678');

/** Payment methods a cashier can record at the counter. */
export const POS_PAYMENT_CHANNELS = [
  PaymentChannel.CASH,
  PaymentChannel.POS_TERMINAL,
  PaymentChannel.BANK_TRANSFER,
] as const;

export const PosCreateSaleSchema = z.object({
  branchId: objectId,
  items: z
    .array(
      z.object({
        productId: objectId,
        quantity: z.number().int().min(1).max(999),
      }),
    )
    .min(1)
    .max(100),
  payment: z.object({
    channel: z.enum([
      PaymentChannel.CASH,
      PaymentChannel.POS_TERMINAL,
      PaymentChannel.BANK_TRANSFER,
    ]),
  }),
  /** Optional walk-in customer capture — links the sale to a customer account by phone. */
  customer: z
    .object({
      phone,
      firstName: z.string().trim().min(1).max(80).optional(),
      lastName: z.string().trim().min(1).max(80).optional(),
    })
    .optional(),
  /**
   * Required when the sale contains prescription-only (POM) items: a short record that
   * the paper prescription was sighted at the counter (prescriber/ref if available).
   */
  rxNote: z.string().trim().min(3).max(500).optional(),
  /** Client-minted UUID; makes double-submits return the same sale. */
  idempotencyKey: z.string().uuid(),
});
export type PosCreateSaleInput = z.infer<typeof PosCreateSaleSchema>;

export const PosSalesQuerySchema = z.object({
  branchId: objectId.optional(),
  /** ISO date (yyyy-mm-dd); defaults to today on the server. */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /** Only the requesting cashier's sales (forced server-side for cashiers). */
  mine: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type PosSalesQuery = z.infer<typeof PosSalesQuerySchema>;

export interface PosSaleItemDto {
  productId: string;
  name: string;
  form?: string;
  strength?: string;
  unitPriceKobo: number;
  quantity: number;
  lineTotalKobo: number;
  requiresPrescription: boolean;
}

export interface PosSaleDto {
  orderId: string;
  orderNo: string;
  branchId: string;
  items: PosSaleItemDto[];
  totals: { subtotalKobo: number; totalKobo: number; currency: string };
  payment: { channel: string; paidAt: string };
  cashier: { id: string; name?: string };
  customer?: { id: string; name?: string; phone?: string };
  rxNote?: string;
  createdAt: string;
}
