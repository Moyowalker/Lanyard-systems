import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'must be a 24-char ObjectId');

export const AddCartItemSchema = z.object({
  branchId: objectId,
  productId: objectId,
  quantity: z.number().int().min(1).max(99),
});
export type AddCartItemInput = z.infer<typeof AddCartItemSchema>;

export const LinkPrescriptionsSchema = z.object({
  prescriptionIds: z.array(objectId).min(1),
});
export type LinkPrescriptionsInput = z.infer<typeof LinkPrescriptionsSchema>;

export interface CartLineDto {
  productId: string;
  name: string;
  quantity: number;
  unitPriceKobo?: number;
  lineTotalKobo?: number;
  requiresPrescription: boolean;
  inStock: boolean;
}

export interface CartDto {
  id: string;
  branchId?: string;
  items: CartLineDto[];
  prescriptionIds: string[];
  subtotalKobo: number;
  currency: string;
  requiresRxVerification: boolean;
}
