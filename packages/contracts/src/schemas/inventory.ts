import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'must be a 24-char ObjectId');

const stockReason = z.string().trim().min(3).max(240);
const batchNo = z.string().trim().min(1).max(120);

function requireBatchPair<T extends z.ZodObject<any>>(schema: T) {
  return schema.superRefine((value, ctx) => {
    const hasBatchNo = Boolean(value.batchNo);
    const hasExpiry = Boolean(value.expiry);

    if (hasBatchNo === hasExpiry) return;

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['batchNo'],
      message: 'batchNo and expiry must be provided together',
    });
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expiry'],
      message: 'batchNo and expiry must be provided together',
    });
  });
}

const InventoryMutationBaseSchema = z.object({
  productId: objectId,
  reorderLevel: z.coerce.number().int().min(0).optional(),
  batchNo: batchNo.optional(),
  expiry: z.coerce.date().optional(),
});

export const ReceiveInventorySchema = requireBatchPair(
  InventoryMutationBaseSchema.extend({
    quantity: z.coerce.number().int().min(1),
    reason: stockReason.optional(),
  }),
);
export type ReceiveInventoryInput = z.infer<typeof ReceiveInventorySchema>;

export const AdjustInventorySchema = requireBatchPair(
  InventoryMutationBaseSchema.extend({
    quantityDelta: z.coerce
      .number()
      .int()
      .refine((value) => value !== 0, 'quantityDelta must be non-zero'),
    reason: stockReason,
  }),
);
export type AdjustInventoryInput = z.infer<typeof AdjustInventorySchema>;

export interface BranchInventoryItemDto {
  productId: string;
  productName: string;
  genericName?: string;
  brand?: string;
  form?: string;
  strength?: string;
  onHand: number;
  reserved: number;
  available: number;
  reorderLevel: number;
  batchCount: number;
  nextExpiry?: string;
  isLowStock: boolean;
}
