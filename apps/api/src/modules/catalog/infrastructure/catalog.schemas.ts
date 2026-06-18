import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ProductForm, ProductStatus, RegulatoryClass } from '@lanyard/contracts';
import { baseSchemaOptions } from '../../../database/schema.helpers';

/* ════════════════════════════════════════════════════════════════════════
 * categories — hierarchical catalog taxonomy (materialised path for fast trees).
 * ════════════════════════════════════════════════════════════════════════ */

export type CategoryDocument = HydratedDocument<Category>;

@Schema({ ...baseSchemaOptions, collection: 'categories' })
export class Category {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: Types.ObjectId, ref: 'Category', index: true })
  parentId?: Types.ObjectId;

  /** Ancestor slugs root→parent, enables subtree queries without recursion. */
  @Prop({ type: [String], default: [] })
  path: string[];

  @Prop({ type: Number, default: 0 })
  displayOrder: number;

  @Prop({ type: Boolean, default: true, index: true })
  isActive: boolean;
}

export const CategorySchema = SchemaFactory.createForClass(Category);
// `slug` uniqueness is declared inline on the @Prop above.
CategorySchema.index({ parentId: 1, displayOrder: 1 });
CategorySchema.index({ path: 1 });

/* ════════════════════════════════════════════════════════════════════════
 * products — GLOBAL product master. Branch-agnostic.
 * Price & stock are per-branch (price_lists / inventory_items) — NOT here.
 * Regulatory metadata is what makes this a healthcare catalog.
 * ════════════════════════════════════════════════════════════════════════ */

export type ProductDocument = HydratedDocument<Product>;

@Schema({ ...baseSchemaOptions, collection: 'products' })
export class Product {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug: string;

  // NB: text search is provided by the single compound text index declared below.
  // MongoDB allows only ONE text index per collection, so these fields are not
  // individually marked `index: 'text'`.
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, trim: true })
  genericName?: string;

  @Prop({ type: String, trim: true })
  brand?: string;

  @Prop({ type: String, trim: true })
  description?: string;

  /** Object-store keys (not URLs) — served via signed/CDN URLs at read time. */
  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ type: String, enum: ProductForm, required: true })
  form: ProductForm;

  @Prop({ type: String, trim: true })
  strength?: string; // e.g. "500mg"

  @Prop({ type: String, trim: true })
  packSize?: string; // e.g. "10 tablets"

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Category' }], default: [], index: true })
  categoryIds: Types.ObjectId[];

  /* ── regulatory ── */
  @Prop({
    type: String,
    enum: RegulatoryClass,
    required: true,
    default: RegulatoryClass.OTC,
    index: true,
  })
  regulatoryClass: RegulatoryClass;

  /** Derived from regulatoryClass (POM/CONTROLLED ⇒ true) but stored for query speed. */
  @Prop({ type: Boolean, default: false, index: true })
  requiresPrescription: boolean;

  @Prop({ type: Boolean, default: false, index: true })
  isControlled: boolean;

  @Prop({ type: String, trim: true })
  nafdacRegNo?: string;

  @Prop({ type: String, trim: true })
  manufacturer?: string;

  @Prop({ type: String, enum: ProductStatus, default: ProductStatus.DRAFT, index: true })
  status: ProductStatus;

  /** Normalised tokens to broaden text search (synonyms, common misspellings). */
  @Prop({ type: [String], default: [] })
  searchTokens: string[];

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const ProductSchema = SchemaFactory.createForClass(Product);
// `slug` uniqueness is declared inline on the @Prop above.
ProductSchema.index({ status: 1, categoryIds: 1 });
ProductSchema.index({ requiresPrescription: 1, status: 1 });
// Weighted text index for MVP search (graduate to Atlas Search later).
// NOTE: changing the fields of an existing text index requires dropping the old
// `product_text` index first (Mongo allows only one text index per collection) —
// see the migration note in the PR. Lower weights for description/packSize so they
// broaden matches (e.g. "sachet", pack details) without outranking name/brand.
ProductSchema.index(
  {
    name: 'text',
    genericName: 'text',
    brand: 'text',
    searchTokens: 'text',
    packSize: 'text',
    description: 'text',
  },
  {
    weights: { name: 10, genericName: 6, brand: 4, searchTokens: 2, packSize: 2, description: 1 },
    name: 'product_text',
  },
);

// Keep requiresPrescription consistent with regulatoryClass on save.
ProductSchema.pre('save', function (next) {
  const cls = (this as ProductDocument).regulatoryClass;
  (this as ProductDocument).requiresPrescription =
    cls === RegulatoryClass.POM || cls === RegulatoryClass.CONTROLLED;
  (this as ProductDocument).isControlled = cls === RegulatoryClass.CONTROLLED;
  next();
});
