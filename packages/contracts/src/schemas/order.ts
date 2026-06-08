import { z } from 'zod';
import { FulfillmentType, OrderStatus } from '../enums';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'must be a 24-char ObjectId');

const fulfillmentSchema = z.object({
  type: z.nativeEnum(FulfillmentType),
  address: z
    .object({
      line1: z.string().trim().min(1),
      line2: z.string().trim().optional(),
      city: z.string().trim().min(1),
      state: z.string().trim().min(1),
      country: z.string().trim().default('NG'),
      contactPhone: z
        .string()
        .regex(/^\+[1-9]\d{6,14}$/)
        .optional(),
    })
    .optional(),
});

export const CreateOrderSchema = z.object({
  fulfillment: fulfillmentSchema,
  prescriptionIds: z.array(objectId).optional(),
});
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

export const OrderTransitionSchema = z.object({
  to: z.nativeEnum(OrderStatus),
  reason: z.string().trim().max(500).optional(),
});
export type OrderTransitionInput = z.infer<typeof OrderTransitionSchema>;

export interface OrderItemDto {
  productId: string;
  name: string;
  unitPriceKobo: number;
  quantity: number;
  lineTotalKobo: number;
  requiresPrescription: boolean;
}

export interface OrderDto {
  id: string;
  orderNo: string;
  customerId: string;
  branchId: string;
  status: OrderStatus;
  fulfillment: { type: string; address?: Record<string, unknown> };
  items: OrderItemDto[];
  prescriptionIds: string[];
  requiresRxVerification: boolean;
  totals: {
    subtotalKobo: number;
    discountKobo: number;
    deliveryKobo: number;
    totalKobo: number;
    currency: string;
  };
  payment: { status: string };
  createdAt: string;
}

export interface QuoteDto {
  branchId: string;
  items: OrderItemDto[];
  subtotalKobo: number;
  deliveryKobo: number;
  totalKobo: number;
  currency: string;
  requiresRxVerification: boolean;
}
