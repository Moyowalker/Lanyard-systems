import { z } from 'zod';
import { ProductForm, ProductStatus, RegulatoryClass } from '../enums';

// Catalog request/response contracts (shared FE+BE). Products are GLOBAL; price and
// availability are per-branch and folded in at read time when a branchId is provided.

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'must be a 24-char ObjectId');

/* ── Queries ── */

export const ProductListQuerySchema = z.object({
  branchId: objectId.optional(),
  category: z.string().optional(), // category slug
  q: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});
export type ProductListQuery = z.infer<typeof ProductListQuerySchema>;

export const ProductSearchQuerySchema = z.object({
  q: z.string().trim().min(1),
  branchId: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ProductSearchQuery = z.infer<typeof ProductSearchQuerySchema>;

export const ProductDetailQuerySchema = z.object({ branchId: objectId.optional() });
export type ProductDetailQuery = z.infer<typeof ProductDetailQuerySchema>;

/* ── Admin write ── */

export const CreateProductSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).optional(), // derived from name when omitted
  genericName: z.string().trim().optional(),
  brand: z.string().trim().optional(),
  description: z.string().trim().optional(),
  form: z.nativeEnum(ProductForm),
  strength: z.string().trim().optional(),
  packSize: z.string().trim().optional(),
  categoryIds: z.array(objectId).default([]),
  regulatoryClass: z.nativeEnum(RegulatoryClass).default(RegulatoryClass.OTC),
  nafdacRegNo: z.string().trim().optional(),
  manufacturer: z.string().trim().optional(),
  status: z.nativeEnum(ProductStatus).default(ProductStatus.DRAFT),
  searchTokens: z.array(z.string()).optional(),
});
export type CreateProductInput = z.infer<typeof CreateProductSchema>;

export const UpdateProductSchema = CreateProductSchema.partial();
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;

export const CreateCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).optional(),
  parentId: objectId.optional(),
  displayOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});
export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;

/* ── Pricing (per-branch) ── */

export const UpsertPriceSchema = z.object({
  productId: objectId,
  priceKobo: z.number().int().min(0),
  compareAtKobo: z.number().int().min(0).optional(),
  isAvailable: z.boolean().default(true),
});
export type UpsertPriceInput = z.infer<typeof UpsertPriceSchema>;

/* ── Response shapes ── */

export interface CategoryDto {
  id: string;
  slug: string;
  name: string;
  parentId?: string;
  displayOrder: number;
}

/** A product as shown in a branch storefront (price/availability present iff branchId given). */
export interface ProductListItemDto {
  id: string;
  slug: string;
  name: string;
  genericName?: string;
  brand?: string;
  form: string;
  strength?: string;
  requiresPrescription: boolean;
  regulatoryClass: string;
  images: string[];
  price?: { priceKobo: number; compareAtKobo?: number; currency: string };
  available?: number;
  inStock?: boolean;
}

export interface ProductDetailDto extends ProductListItemDto {
  description?: string;
  packSize?: string;
  manufacturer?: string;
  nafdacRegNo?: string;
  categoryIds: string[];
}
