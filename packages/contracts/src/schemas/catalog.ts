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
  /** Exact barcode or SKU match (scanner lookup) — takes precedence over `q`. */
  barcode: z.string().trim().min(1).max(64).optional(),
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
  sku: z.string().trim().min(1).max(64).optional(), // stock-keeping unit (distinct from slug)
  barcode: z.string().trim().min(4).max(64).optional(), // EAN/UPC or custom shelf barcode
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
  // New products go live by default once they have a branch price; admins can still
  // pick Draft for work-in-progress entries.
  status: z.nativeEnum(ProductStatus).default(ProductStatus.PUBLISHED),
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
  costKobo: z.number().int().min(0).optional(),
  compareAtKobo: z.number().int().min(0).optional(),
  isAvailable: z.boolean().default(true),
});
export type UpsertPriceInput = z.infer<typeof UpsertPriceSchema>;

/* ── Bulk medicine import (global product + per-branch price/opening stock) ── */

export const BulkMedicineImportRowSchema = CreateProductSchema.omit({
  categoryIds: true,
  searchTokens: true,
})
  .extend({
    rowNumber: z.coerce.number().int().min(1),
    categoryIds: z.array(objectId).default([]),
    // Imports must classify every medicine EXPLICITLY. CreateProductSchema defaults to OTC,
    // which is safe for a human filling the admin form but not for a bulk file: a blank or
    // mistyped class would silently make a prescription-only medicine sellable without a
    // pharmacist check. No default here — the importer rejects the row instead.
    regulatoryClass: z.nativeEnum(RegulatoryClass, {
      required_error: 'regulatoryClass is required (OTC, POM or CONTROLLED)',
      invalid_type_error: 'regulatoryClass must be one of OTC, POM or CONTROLLED',
    }),
    // Imported rows land hidden so staff review price and classification before customers
    // can see them. CreateProductSchema keeps its PUBLISHED default for the admin form.
    status: z.nativeEnum(ProductStatus).default(ProductStatus.DRAFT),
    priceKobo: z.coerce.number().int().min(0),
    costKobo: z.coerce.number().int().min(0).optional(),
    compareAtKobo: z.coerce.number().int().min(0).optional(),
    isAvailable: z.coerce.boolean().default(true),
    openingQuantity: z.coerce.number().int().min(0).default(0),
    reorderLevel: z.coerce.number().int().min(0).optional(),
    batchNo: z.string().trim().min(1).max(120).optional(),
    expiry: z.coerce.date().optional(),
    reason: z.string().trim().min(3).max(240).optional(),
  })
  .superRefine((value, ctx) => {
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
export type BulkMedicineImportRowInput = z.infer<typeof BulkMedicineImportRowSchema>;

export const BulkMedicineImportSchema = z.object({
  rows: z.array(BulkMedicineImportRowSchema).min(1).max(500),
});
export type BulkMedicineImportInput = z.infer<typeof BulkMedicineImportSchema>;

export interface BulkMedicineImportRowResult {
  rowNumber: number;
  name: string;
  productId?: string;
  slug?: string;
  productCreated: boolean;
  priceUpdated: boolean;
  inventoryReceived: boolean;
}

export interface BulkMedicineImportRowError {
  rowNumber: number;
  name?: string;
  code: string;
  message: string;
  field?: string;
}

export interface BulkMedicineImportResultDto {
  ok: boolean;
  branchId: string;
  totalRows: number;
  createdProducts: number;
  updatedPrices: number;
  receivedInventory: number;
  succeeded: BulkMedicineImportRowResult[];
  failed: BulkMedicineImportRowError[];
}

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
  sku?: string;
  barcode?: string;
  name: string;
  genericName?: string;
  brand?: string;
  form: string;
  strength?: string;
  packSize?: string;
  description?: string;
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
