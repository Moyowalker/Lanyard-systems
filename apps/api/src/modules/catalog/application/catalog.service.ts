import { Injectable, Logger } from '@nestjs/common';
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
import { cursorFilter, cursorFilterDesc, paginate } from '../../../core/pagination/cursor';
import { StorageService } from '../../../core/storage/storage.service';

export interface UploadedProductImage {
  buffer: Buffer;
  mime: string;
  ext: string;
}

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    @InjectModel(Category.name) private readonly categoryModel: Model<Category>,
    private readonly pricing: PricingService,
    private readonly inventory: InventoryService,
    private readonly storage: StorageService,
  ) {}

  /* ── public reads ── */

  async listCategories(): Promise<CategoryDto[]> {
    const rows = await this.categoryModel.find({ isActive: true }).sort({ name: 1 }).lean();
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
    await this.restrictToBranchPrices(filter, query.branchId);
    if (query.category) {
      const cat = await this.categoryModel.findOne({ slug: query.category }).lean();
      filter.categoryIds = cat?._id ?? new Types.ObjectId(); // no match → empty result
    }

    const rows = query.q
      ? await this.textOrSubstring(filter, query.q, query.limit + 1)
      : await this.productModel
          .find(filter)
          .sort({ _id: 1 })
          .limit(query.limit + 1)
          .lean();

    const items = await this.decorate(rows, query.branchId);
    // Show every priced product at the branch; out-of-stock ones render with an
    // "Out of stock" badge (the card disables buying), rather than disappearing.
    const visible = query.branchId ? items.filter((i) => i.price) : items;
    return paginate(visible, query.limit);
  }

  /**
   * Staff POS product lookup: published + priced products at a branch, INCLUDING those
   * hidden from the storefront (`isAvailable: false`). Served behind `pos:sell` — never
   * exposed on the public catalog routes.
   */
  async listProductsForPos(query: ProductListQuery): Promise<Paginated<ProductListItemDto>> {
    // Scanner path: exact barcode/SKU match, bypassing text search entirely.
    if (query.barcode) {
      const code = query.barcode.trim();
      const rows = await this.productModel
        .find({
          status: ProductStatus.PUBLISHED,
          $or: [{ barcode: code }, { sku: code.toUpperCase() }],
        })
        .limit(2)
        .lean();
      const items = await this.decorate(rows, query.branchId, true);
      return {
        data: query.branchId ? items.filter((i) => i.price) : items,
        meta: { nextCursor: null },
      };
    }

    const filter: FilterQuery<Product> = {
      status: ProductStatus.PUBLISHED,
      ...cursorFilter(query.cursor),
    };
    await this.restrictToBranchPrices(filter, query.branchId, true);

    const rows = query.q
      ? await this.textOrSubstring(filter, query.q, query.limit + 1, true)
      : await this.productModel
          .find(filter)
          .sort({ _id: 1 })
          .limit(query.limit + 1)
          .lean();

    const items = await this.decorate(rows, query.branchId, true);
    const visible = query.branchId ? items.filter((i) => i.price) : items;
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

  async search(query: ProductSearchQuery): Promise<Paginated<ProductListItemDto>> {
    // Primary: weighted full-text match. Fallback: case-insensitive substring match
    // so partial terms and minor misspellings still return something useful — and so
    // a missing/conflicted text index degrades to substring instead of a 500.
    const filter: FilterQuery<Product> = {
      status: ProductStatus.PUBLISHED,
      ...cursorFilter(query.cursor),
    };
    await this.restrictToBranchPrices(filter, query.branchId);
    const rows = await this.textOrSubstring(filter, query.q, query.limit + 1);
    const items = await this.decorateForStorefront(rows, query.branchId);
    return paginate(query.branchId ? items.filter((item) => item.price) : items, query.limit);
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
      throw this.duplicateProductError(err) ?? err;
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
    let product: ProductDocument | null;
    try {
      product = await this.productModel.findByIdAndUpdate(id, { $set: update }, { new: true });
    } catch (err) {
      // A colliding slug/sku violates a unique index (error 11000). Surface it as
      // a 409 with a clear message instead of leaking a 500 Internal Server Error.
      throw this.duplicateProductError(err) ?? err;
    }
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
    // Newest-first so freshly created products surface at the top of the admin
    // catalog (and stay within the page limit) instead of being buried after
    // older rows. Pair the descending sort with the matching cursor helper.
    const filter: FilterQuery<Product> = { ...cursorFilterDesc(query.cursor) };
    let rows: Array<Record<string, unknown> & { _id: Types.ObjectId }>;
    if (query.q) {
      try {
        rows = await this.productModel
          .find({ ...filter, $text: { $search: query.q } })
          .sort({ _id: -1 })
          .limit(query.limit + 1)
          .lean();
      } catch (err) {
        this.logger.warn(
          `Admin text search failed, falling back to substring match: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        rows = (await this.productModel
          .find({ ...filter, ...this.substringFilter(query.q, true) })
          .sort({ _id: -1 })
          .limit(query.limit + 1)
          .lean()) as Array<Record<string, unknown> & { _id: Types.ObjectId }>;
      }
    } else {
      rows = await this.productModel
        .find(filter)
        .sort({ _id: -1 })
        .limit(query.limit + 1)
        .lean();
    }
    const mapped = await Promise.all(
      rows.map(async (r) => ({
        ...r,
        id: r._id.toString(),
        imageUrls: await this.signedImages((r.images as string[]) ?? []),
      })),
    );
    return paginate(mapped, query.limit);
  }

  /* ── helpers ── */

  /**
   * Merge global product rows with per-branch price + availability (when branchId given).
   * `includeHidden` attaches the price even when `isAvailable` is false — used by the
   * staff POS lookup, since that flag only controls STOREFRONT visibility.
   */
  private async decorate(
    rows: Array<Record<string, unknown> & { _id: Types.ObjectId }>,
    branchId?: string,
    includeHidden = false,
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
          barcode: r.barcode as string | undefined,
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
          if (price && (price.isAvailable || includeHidden)) {
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
    // Keep priced products even when out of stock (shown with an "Out of stock" badge).
    return branchId ? items.filter((i) => i.price) : items;
  }

  /**
   * Apply branch price visibility before the product query is limited. Filtering after
   * pagination strands priced products behind unrelated global catalog rows and can return a
   * short first page with no next cursor.
   */
  private async restrictToBranchPrices(
    filter: FilterQuery<Product>,
    branchId?: string,
    includeHidden = false,
  ): Promise<void> {
    if (!branchId) return;

    const productIds = await this.pricing.getPricedProductIds(branchId, includeHidden);
    const cursor = (filter._id as Record<string, unknown> | undefined) ?? {};
    filter._id = { ...cursor, $in: productIds };
  }

  /**
   * Run a weighted `$text` search and fall back to a case-insensitive substring match
   * when the text query throws (a missing or conflicted `product_text` index throws at
   * query time — e.g. prod runs `autoIndex: false`) OR returns nothing. Without this
   * guard a broken index surfaces as a 500 and the POS/search UIs render "no results".
   */
  private async textOrSubstring(
    baseFilter: FilterQuery<Product>,
    q: string,
    limit: number,
    forPos = false,
  ): Promise<Array<Record<string, unknown> & { _id: Types.ObjectId }>> {
    try {
      const rows = await this.productModel
        .find({ ...baseFilter, $text: { $search: q } })
        .sort({ _id: 1 })
        .limit(limit)
        .lean();
      if (rows.length > 0) return rows as Array<Record<string, unknown> & { _id: Types.ObjectId }>;
    } catch (err) {
      this.logger.warn(
        `Text search failed, falling back to substring match: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    return this.productModel
      .find({ ...baseFilter, ...this.substringFilter(q, forPos) })
      .sort({ _id: 1 })
      .limit(limit)
      .lean() as unknown as Array<Record<string, unknown> & { _id: Types.ObjectId }>;
  }

  /**
   * Case-insensitive substring match across the customer-facing fields. For POS
   * lookups (`forPos`), also match SKU and barcode so typed codes resolve even when
   * the exact-match scanner path is not used.
   */
  private substringFilter(q: string, forPos = false): FilterQuery<Product> {
    const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const or: FilterQuery<Product>[] = [
      { name: rx },
      { genericName: rx },
      { brand: rx },
      { packSize: rx },
    ];
    if (forPos) or.push({ sku: rx }, { barcode: rx });
    return { $or: or };
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

  /**
   * Translate a MongoDB duplicate-key error (11000) on the product collection into
   * a 409 CONFLICT that names the offending field (slug or sku). Returns undefined
   * when the error is unrelated, so callers can rethrow the original.
   */
  private duplicateProductError(err: unknown): DomainError | undefined {
    if (!this.isDuplicateKey(err)) return undefined;
    const keyValue = (err as { keyValue?: Record<string, unknown> }).keyValue ?? {};
    if ('sku' in keyValue) {
      return new DomainError(ErrorCode.CONFLICT, `Product SKU "${keyValue.sku}" already exists`);
    }
    if ('barcode' in keyValue) {
      return new DomainError(
        ErrorCode.CONFLICT,
        `Product barcode "${keyValue.barcode}" already exists`,
      );
    }
    if ('slug' in keyValue) {
      return new DomainError(ErrorCode.CONFLICT, `Product slug "${keyValue.slug}" already exists`);
    }
    return new DomainError(ErrorCode.CONFLICT, 'Product already exists');
  }
}
