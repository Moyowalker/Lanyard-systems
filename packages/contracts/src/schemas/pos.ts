import { z } from 'zod';
import { PaymentChannel } from '../enums';

// Point-of-sale (counter) sales. A cashier rings up a walk-in customer in the admin
// console; the sale is recorded as a normal order (fulfillment type "counter") that is
// paid offline and completed (stock dispensed) in one transaction, so it flows into the
// same inventory ledger and reports as online orders.

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'must be a 24-char ObjectId');
const phone = z.string().regex(/^\+[1-9]\d{6,14}$/, 'phone must be E.164, e.g. +2348012345678');

/** A real yyyy-mm-dd calendar date (rejects e.g. 2026-99-99, not just the wrong shape). */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, 'date must be a valid yyyy-mm-dd date');

/** Query-string boolean values. Interpret truthiness at the call site: only "true"/"1". */
const queryBool = z.enum(['true', 'false', '1', '0', '']);

/** Whether a query-string boolean value means true. */
export function isQueryTrue(value?: string): boolean {
  return value === 'true' || value === '1';
}

/** Payment methods a cashier can record at the counter. */
export const POS_PAYMENT_CHANNELS = [
  PaymentChannel.CASH,
  PaymentChannel.POS_TERMINAL,
  PaymentChannel.BANK_TRANSFER,
  PaymentChannel.HMO,
] as const;

const posChannel = z.enum([
  PaymentChannel.CASH,
  PaymentChannel.POS_TERMINAL,
  PaymentChannel.BANK_TRANSFER,
  PaymentChannel.HMO,
]);

/** Till discount: a percentage of the subtotal or a fixed cash amount (kobo). */
export const PosDiscountSchema = z
  .object({
    type: z.enum(['percent', 'fixed']),
    value: z.number().positive(),
  })
  .superRefine((discount, ctx) => {
    if (discount.type === 'percent' && discount.value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'percentage discount cannot exceed 100',
      });
    }
    if (discount.type === 'fixed' && !Number.isInteger(discount.value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'fixed discount must be an integer kobo amount',
      });
    }
  });
export type PosDiscountInput = z.infer<typeof PosDiscountSchema>;

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
  /**
   * 1–3 payment entries (split payment). The server validates that amounts sum to the
   * post-discount total exactly.
   */
  payments: z
    .array(
      z.object({
        channel: posChannel,
        amountKobo: z.number().int().positive(),
      }),
    )
    .min(1)
    .max(3),
  /** Optional till discount applied to the subtotal. */
  discount: PosDiscountSchema.optional(),
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
  date: isoDate.optional(),
  /** Only the requesting cashier's sales (forced server-side for cashiers). */
  mine: queryBool.optional(),
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
  totals: { subtotalKobo: number; discountKobo: number; totalKobo: number; currency: string };
  /** Primary (first) payment channel — kept for receipts and older records. */
  payment: { channel: string; paidAt: string };
  /** Full split-payment breakdown (single entry for old sales). */
  payments: Array<{ channel: string; amountKobo: number }>;
  cashier: { id: string; name?: string };
  customer?: { id: string; name?: string; phone?: string };
  rxNote?: string;
  /** Cumulative returned quantity per productId (absent when nothing returned). */
  returnedByProduct?: Record<string, number>;
  orderStatus?: string;
  createdAt: string;
}

/** Return part or all of a completed counter sale. Omitted `items` = full return. */
export const PosReturnSchema = z.object({
  items: z
    .array(
      z.object({
        productId: objectId,
        quantity: z.number().int().min(1).max(999),
      }),
    )
    .min(1)
    .optional(),
  reason: z.string().trim().min(3).max(500),
});
export type PosReturnInput = z.infer<typeof PosReturnSchema>;

export interface PosReturnResultDto {
  orderId: string;
  refundKobo: number;
  orderStatus: string;
  restocked: Array<{ productId: string; quantity: number }>;
}
