import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import {
  CategoryDto,
  CreateCategoryInput,
  CreateProductInput,
  ErrorCode,
  Paginated,
  ProductDetailDto,
  ProductDetailQuery,
  ProductListItemDto,
  ProductListQuery,
  ProductSearchQuery,
  ProductStatus,
  RegulatoryClass,
  UpdateProductInput,
} from '@lanyard/contracts';

import { Category, Product, ProductDocument } from '../infrastructure/catalog.schemas';
import { PricingService, PriceEntry } from '../../pricing/application/pricing.service';
import { InventoryService } from '../../inventory/application/inventory.service';
import { DomainError } from '../../../core/errors/domain-error';
import { cursorFilter, paginate } from '../../../core/pagination/cursor';
import { StorageService } from '../../../core/storage/storage.service';

export interface UploadedProductImage {
  buffer: Buffer;
  mime: string;
  ext: string;
}

@Injectable()
export class CatalogService {
  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    @InjectModel(Category.name) private readonly categoryModel: Model<Category>,
    private readonly pricing: PricingService,
    private readonly inventory: InventoryService,
    private readonly storage: StorageService,
  ) {}

  /* ── public reads ── */

  async listCategories(): Promise<CategoryDto[]> {
    const rows = await this.categoryModel.find({ isActive: true }).sort({ displayOrder: 1 }).lean();
    return rows.map((c) => ({
      id: c._id.toString(),
      slug: c.slug,
      name: c.name,
      parentId: c.parentId?.toString(),
      displayOrder: c.displayOrder,
    }));
  }

  async listProducts(query: ProductListQuery): Promise<Paginated<ProductListItemDto>> {
    const filter: FilterQuery<Product> = {
      status: ProductStatus.PUBLISHED,
      ...cursorFilter(query.cursor),
    };
    if (query.category) {
      const cat = await this.categoryModel.findOne({ slug: query.category }).lean();
      filter.categoryIds = cat?._id ?? new Types.ObjectId(); // no match → empty result
    }
    if (query.q) filter.$text = { $search: query.q };

    const rows = await this.productModel
      .find(filter)
      .sort({ _id: 1 })
      .limit(query.limit + 1)
      .lean();

    const items = await this.decorate(rows, query.branchId);
    // Storefront hides items unavailable at the selected branch.
    const visible = query.branchId ? items.filter((i) => i.price && i.inStock) : items;
    return paginate(visible, query.limit);
  }

  async getProduct(slug: string, query: ProductDetailQuery): Promise<ProductDetailDto> {
    const product = await this.productModel
      .findOne({ slug, status: ProductStatus.PUBLISHED })
      .lean();
    if (!product) throw new DomainError(ErrorCode.NOT_FOUND, 'Product not found');
    const [item] = await this.decorate([product], query.branchId);
    return {
      ...item,
      description: product.description,
      packSize: product.packSize,
      manufacturer: product.manufacturer,
      nafdacRegNo: product.nafdacRegNo,
      categoryIds: (product.categoryIds ?? []).map((id) => id.toString()),
    };
  }

  async search(query: ProductSearchQuery): Promise<{ data: ProductListItemDto[] }> {
    // Primary: weighted full-text match. Fallback: case-insensitive substring match
    // so partial terms and minor misspellings still return something useful.
    let rows = await this.productModel
      .find({ status: ProductStatus.PUBLISHED, $text: { $search: query.q } })
      .limit(query.limit)
      .lean();
    if (rows.length === 0) {
      rows = await this.productModel
        .find({ status: ProductStatus.PUBLISHED, ...this.substringFilter(query.q) })
        .limit(query.limit)
        .lean();
    }
    return { data: await this.decorateForStorefront(rows, query.branchId) };
  }

  /** Lightweight typeahead suggestions — prefix/substring on the most relevant fields. */
  async suggest(query: ProductSearchQuery): Promise<{ data: ProductListItemDto[] }> {
    const limit = Math.min(query.limit, 8);
    const rows = await this.productModel
      .find({ status: ProductStatus.PUBLISHED, ...this.substringFilter(query.q) })
      .limit(limit)
      .lean();
    return { data: await this.decorateForStorefront(rows, query.branchId) };
  }

  /* ── admin writes ── */

  async createProduct(input: CreateProductInput): Promise<ProductDocument> {
    const slug = input.slug ?? this.slugify(input.name);
    try {
      return await this.productModel.create({
        ...input,
        slug,
        categoryIds: input.categoryIds.map((id) => new Types.ObjectId(id)),
        requiresPrescription:
          input.regulatoryClass === RegulatoryClass.POM ||
          input.regulatoryClass === RegulatoryClass.CONTROLLED,
        isControlled: input.regulatoryClass === RegulatoryClass.CONTROLLED,
      });
    } catch (err) {
      if (this.isDuplicateKey(err)) {
        throw new DomainError(ErrorCode.CONFLICT, `Product slug "${slug}" already exists`);
      }
      throw err;
    }
  }

  async updateProduct(id: string, input: UpdateProductInput): Promise<ProductDocument> {
    const update: Record<string, unknown> = { ...input };
    if (input.categoryIds) update.categoryIds = input.categoryIds.map((c) => new Types.ObjectId(c));
    if (input.regulatoryClass) {
      update.requiresPrescription =
        input.regulatoryClass === RegulatoryClass.POM ||
        input.regulatoryClass === RegulatoryClass.CONTROLLED;
      update.isControlled = input.regulatoryClass === RegulatoryClass.CONTROLLED;
    }
    const product = await this.productModel.findByIdAndUpdate(id, { $set: update }, { new: true });
    if (!product) throw new DomainError(ErrorCode.NOT_FOUND, 'Product not found');
    return product;
  }

  async addProductImages(id: string, files: UploadedProductImage[]): Promise<ProductDocument> {
    if (files.length === 0) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'At least one image is required');
    }
    const product = await this.productModel.findById(id).select('_id');
    if (!product) throw new DomainError(ErrorCode.NOT_FOUND, 'Product not found');

    const keys: string[] = [];
    for (const file of files) {
      const objectKey = `products/${id}/${randomUUID()}.${file.ext}`;
      await this.storage.putObject(objectKey, file.buffer, file.mime);
      keys.push(objectKey);
    }

    const updated = await this.productModel.findByIdAndUpdate(
      id,
      { $push: { images: { $each: keys } } },
      { new: true },
    );
    if (!updated) throw new DomainError(ErrorCode.NOT_FOUND, 'Product not found');
    return updated;
  }

  async removeProductImage(id: string, key: string): Promise<ProductDocument> {
    const product = await this.productModel.findByIdAndUpdate(
      id,
      { $pull: { images: key } },
      { new: true },
    );
    if (!product) throw new DomainError(ErrorCode.NOT_FOUND, 'Product not found');
    return product;
  }

  async reorderProductImages(id: string, images: string[]): Promise<ProductDocument> {
    const product = await this.productModel.findById(id);
    if (!product) throw new DomainError(ErrorCode.NOT_FOUND, 'Product not found');
    const current = new Set(product.images);
    const next = new Set(images);
    if (current.size !== next.size || images.some((key) => !current.has(key))) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        'Image order does not match product images',
      );
    }
    product.images = images;
    await product.save();
    return product;
  }

  async createCategory(input: CreateCategoryInput): Promise<Category & { id: string }> {
    const slug = input.slug ?? this.slugify(input.name);
    try {
      const cat = await this.categoryModel.create({
        name: input.name,
        slug,
        parentId: input.parentId ? new Types.ObjectId(input.parentId) : undefined,
        displayOrder: input.displayOrder,
        isActive: input.isActive,
      });
      return Object.assign(cat.toObject(), { id: cat._id.toString() });
    } catch (err) {
      if (this.isDuplicateKey(err)) {
        throw new DomainError(ErrorCode.CONFLICT, `Category slug "${slug}" already exists`);
      }
      throw err;
    }
  }

  async listProductsAdmin(
    query: ProductListQuery,
  ): Promise<Paginated<{ id: string } & Record<string, unknown>>> {
    const filter: FilterQuery<Product> = { ...cursorFilter(query.cursor) };
    if (query.q) filter.$text = { $search: query.q };
    const rows = await this.productModel
      .find(filter)
      .sort({ _id: 1 })
      .limit(query.limit + 1)
      .lean();
    const mapped = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        id: r._id.toString(),
        imageUrls: await this.signedImages(r.images ?? []),
      })),
    );
    return paginate(mapped, query.limit);
  }

  /* ── helpers ── */

  /** Merge global product rows with per-branch price + availability (when branchId given). */
  private async decorate(
    rows: Array<Record<string, unknown> & { _id: Types.ObjectId }>,
    branchId?: string,
  ): Promise<ProductListItemDto[]> {
    let priceMap = new Map<string, PriceEntry>();
    let availMap = new Map<string, number>();
    if (branchId) {
      const ids = rows.map((r) => r._id.toString());
      [priceMap, availMap] = await Promise.all([
        this.pricing.getPriceMap(branchId, ids),
        this.inventory.getAvailabilityMap(branchId, ids),
      ]);
    }

    return Promise.all(
      rows.map(async (r) => {
        const id = r._id.toString();
        const price = priceMap.get(id);
        const available = availMap.get(id);
        const base: ProductListItemDto = {
          id,
          slug: r.slug as string,
          sku: r.sku as string | undefined,
          name: r.name as string,
          genericName: r.genericName as string | undefined,
          brand: r.brand as string | undefined,
          form: r.form as string,
          strength: r.strength as string | undefined,
          packSize: r.packSize as string | undefined,
          description: r.description as string | undefined,
          requiresPrescription: Boolean(r.requiresPrescription),
          regulatoryClass: r.regulatoryClass as string,
          images: await this.signedImages((r.images as string[]) ?? []),
        };
        if (branchId) {
          if (price && price.isAvailable) {
            base.price = {
              priceKobo: price.priceKobo,
              compareAtKobo: price.compareAtKobo,
              currency: price.currency,
            };
          }
          base.available = available ?? 0;
          base.inStock = (available ?? 0) > 0;
        }
        return base;
      }),
    );
  }

  /** Decorate rows and, when a branch is selected, hide items without a price/stock there. */
  private async decorateForStorefront(
    rows: Array<Record<string, unknown> & { _id: Types.ObjectId }>,
    branchId?: string,
  ): Promise<ProductListItemDto[]> {
    const items = await this.decorate(rows, branchId);
    return branchId ? items.filter((i) => i.price && i.inStock) : items;
  }

  /** Case-insensitive substring match across the customer-facing fields. */
  private substringFilter(q: string): FilterQuery<Product> {
    const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    return { $or: [{ name: rx }, { genericName: rx }, { brand: rx }, { packSize: rx }] };
  }

  private async signedImages(keys: string[]): Promise<string[]> {
    return Promise.all(
      keys.map((key) =>
        key.startsWith('http') ? Promise.resolve(key) : this.storage.getSignedDownloadUrl(key),
      ),
    );
  }

  private slugify(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private isDuplicateKey(err: unknown): boolean {
    return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
  }
}
