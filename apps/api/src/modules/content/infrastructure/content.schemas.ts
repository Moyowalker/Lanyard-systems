import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  ContentStatus,
  LeadStatus,
  PromotionScope,
  PromotionType,
  Currency,
} from '@lanyard/contracts';
import {
  baseSchemaOptions,
  OPTIONAL_KOBO,
  CURRENCY_PROP,
  E164_REGEX,
  EMAIL_REGEX,
} from '../../../database/schema.helpers';

/* ════════════════════════════════════════════════════════════════════════
 * content_blocks — editable marketing content (home sections, services, FAQ).
 * ════════════════════════════════════════════════════════════════════════ */

export type ContentBlockDocument = HydratedDocument<ContentBlock>;

@Schema({ ...baseSchemaOptions, collection: 'content_blocks' })
export class ContentBlock {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  key: string; // e.g. "home.hero", "faq.delivery"

  @Prop({ type: String, trim: true })
  title?: string;

  /** Flexible structured content (rich text / sections / media keys). */
  @Prop({ type: Object, default: {} })
  body: Record<string, unknown>;

  @Prop({ type: String, enum: ContentStatus, default: ContentStatus.DRAFT, index: true })
  status: ContentStatus;

  @Prop({ type: Object })
  seo?: { title?: string; description?: string; keywords?: string[] };
}

export const ContentBlockSchema = SchemaFactory.createForClass(ContentBlock);
// `key` uniqueness is declared inline on the @Prop above.

/* ════════════════════════════════════════════════════════════════════════
 * blog_posts — health blog articles (SEO).
 * ════════════════════════════════════════════════════════════════════════ */

export type BlogPostDocument = HydratedDocument<BlogPost>;

@Schema({ ...baseSchemaOptions, collection: 'blog_posts' })
export class BlogPost {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug: string;

  @Prop({ required: true, trim: true, index: 'text' })
  title: string;

  @Prop({ type: String, trim: true })
  excerpt?: string;

  @Prop({ type: String })
  coverImageKey?: string;

  @Prop({ type: String })
  bodyMarkdown?: string;

  @Prop({ type: [String], default: [], index: true })
  tags: string[];

  @Prop({ type: String, trim: true })
  author?: string;

  @Prop({ type: String, enum: ContentStatus, default: ContentStatus.DRAFT, index: true })
  status: ContentStatus;

  @Prop({ type: Date })
  publishedAt?: Date;

  @Prop({ type: Object })
  seo?: { title?: string; description?: string; keywords?: string[] };
}

export const BlogPostSchema = SchemaFactory.createForClass(BlogPost);
// `slug` uniqueness is declared inline on the @Prop above.
BlogPostSchema.index({ status: 1, publishedAt: -1 });

/* ════════════════════════════════════════════════════════════════════════
 * promotions — discount rules (basic engine at MVP; loyalty deferred).
 * ════════════════════════════════════════════════════════════════════════ */

export type PromotionDocument = HydratedDocument<Promotion>;

@Schema({ ...baseSchemaOptions, collection: 'promotions' })
export class Promotion {
  @Prop({ required: true, unique: true, uppercase: true, trim: true })
  code: string;

  @Prop({ type: String, enum: PromotionType, required: true })
  type: PromotionType;

  /** For PERCENT: basis points or whole percent (0-100). For FIXED: see valueKobo. */
  @Prop({ type: Number, min: 0 })
  percent?: number;

  @Prop(OPTIONAL_KOBO)
  valueKobo?: number;

  @Prop(CURRENCY_PROP)
  currency: Currency;

  @Prop({ type: String, enum: PromotionScope, default: PromotionScope.GLOBAL })
  scope: PromotionScope;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Branch' }], default: [] })
  branchIds: Types.ObjectId[]; // when scope = BRANCH

  @Prop(OPTIONAL_KOBO)
  minSubtotalKobo?: number;

  @Prop({ type: Date }) validFrom?: Date;
  @Prop({ type: Date }) validTo?: Date;

  @Prop({ type: Number, min: 0 }) usageLimit?: number; // total redemptions
  @Prop({ type: Number, min: 0 }) perCustomerLimit?: number;
  @Prop({ type: Number, default: 0 }) usedCount: number;

  @Prop({ type: Boolean, default: true, index: true })
  isActive: boolean;
}

export const PromotionSchema = SchemaFactory.createForClass(Promotion);
// `code` uniqueness is declared inline on the @Prop above.
PromotionSchema.index({ isActive: 1, validFrom: 1, validTo: 1 });

/* ════════════════════════════════════════════════════════════════════════
 * leads — captured from marketing CTAs / contact forms.
 * ════════════════════════════════════════════════════════════════════════ */

export type LeadDocument = HydratedDocument<Lead>;

@Schema({ ...baseSchemaOptions, collection: 'leads' })
export class Lead {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, match: E164_REGEX, trim: true })
  phone?: string;

  @Prop({ type: String, lowercase: true, match: EMAIL_REGEX, trim: true })
  email?: string;

  @Prop({ type: String, trim: true })
  message?: string;

  @Prop({ type: String, trim: true })
  topic?: string;

  @Prop({ type: String, trim: true })
  branch?: string;

  /** Where the lead came from, e.g. "contact", "rx-upload-cta", "promo". */
  @Prop({ type: String, trim: true, index: true })
  source?: string;

  @Prop({ type: String, enum: LeadStatus, default: LeadStatus.NEW, index: true })
  status: LeadStatus;
}

export const LeadSchema = SchemaFactory.createForClass(Lead);
LeadSchema.index({ status: 1, createdAt: -1 });
