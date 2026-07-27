import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import {
  BulkMedicineImportResultDto,
  BulkMedicineImportRowError,
  BulkMedicineImportRowInput,
  BulkMedicineImportRowResult,
  BulkMedicineImportRowSchema,
  CreateProductInput,
  ErrorCode,
  ProductStatus,
  RegulatoryClass,
  UpsertPriceInput,
} from '@lanyard/contracts';

import { PricingService } from '../../pricing/application/pricing.service';
import { InventoryService } from '../../inventory/application/inventory.service';
import { DomainError } from '../../../core/errors/domain-error';
import { CatalogService } from './catalog.service';

type RawImportRow = Record<string, unknown>;

export interface UploadedMedicineImportFile {
  buffer: Buffer;
  originalName?: string;
  mime?: string;
}

/**
 * Ceiling on rows per upload. The importer writes products, prices and stock movements
 * sequentially, so very large files exhaust the request timeout part-way and leave a
 * confusing partial import. Failing fast with a "split the file" message beats that.
 */
const MAX_IMPORT_ROWS = 2000;

/** A field-level problem found while normalizing a row, before schema validation. */
interface RowFieldError {
  field: string;
  message: string;
}

const REGULATORY_CLASSES = Object.values(RegulatoryClass);
const PRODUCT_STATUSES = Object.values(ProductStatus);

@Injectable()
export class BulkMedicineImportService {
  constructor(
    private readonly catalog: CatalogService,
    private readonly pricing: PricingService,
    private readonly inventory: InventoryService,
  ) {}

  async importFile(
    branchId: string,
    actorId: string,
    file: UploadedMedicineImportFile,
  ): Promise<BulkMedicineImportResultDto> {
    const { text: rawRows, typed: typedRows } = this.readRows(file);
    if (rawRows.length === 0) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Import file has no medicine rows');
    }
    if (rawRows.length > MAX_IMPORT_ROWS) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        `Import file has ${rawRows.length} rows, which exceeds the ${MAX_IMPORT_ROWS}-row limit. ` +
          'Split it into smaller files (about 500 rows each) and upload them in turn.',
      );
    }

    // Resolved once for the whole file so category names cost one query, not one per row.
    const categoryLookup = await this.loadCategoryLookup();

    const succeeded: BulkMedicineImportRowResult[] = [];
    const failed: BulkMedicineImportRowError[] = [];

    for (const [index, rawRow] of rawRows.entries()) {
      const rowNumber = index + 2;
      const rowName = this.asText(this.pick(rawRow, ['name', 'medicine', 'product'])) || undefined;

      const { values, errors } = this.normalizeRow(
        rawRow,
        typedRows[index] ?? rawRow,
        rowNumber,
        categoryLookup,
      );
      if (errors.length > 0) {
        failed.push(
          ...errors.map((error) => ({
            rowNumber,
            name: rowName,
            code: ErrorCode.VALIDATION_FAILED,
            message: error.message,
            field: error.field,
          })),
        );
        continue;
      }

      const parsed = BulkMedicineImportRowSchema.safeParse(values);
      if (!parsed.success) {
        failed.push(
          ...parsed.error.issues.map((issue) => ({
            rowNumber,
            name: rowName,
            code: ErrorCode.VALIDATION_FAILED,
            message: issue.message,
            field: issue.path.join('.') || undefined,
          })),
        );
        continue;
      }

      try {
        const result = await this.importRow(branchId, actorId, parsed.data);
        succeeded.push(result);
      } catch (err) {
        failed.push(this.toRowError(rowNumber, parsed.data.name, err));
      }
    }

    return {
      ok: failed.length === 0,
      branchId,
      totalRows: rawRows.length,
      createdProducts: succeeded.filter((row) => row.productCreated).length,
      updatedPrices: succeeded.filter((row) => row.priceUpdated).length,
      receivedInventory: succeeded.filter((row) => row.inventoryReceived).length,
      succeeded,
      failed,
    };
  }

  private async importRow(
    branchId: string,
    actorId: string,
    row: BulkMedicineImportRowInput,
  ): Promise<BulkMedicineImportRowResult> {
    const product = await this.catalog.createProduct(this.toProductInput(row));
    const productId = product._id.toString();

    const price: UpsertPriceInput = {
      productId,
      priceKobo: row.priceKobo,
      costKobo: row.costKobo,
      compareAtKobo: row.compareAtKobo,
      isAvailable: row.isAvailable,
    };
    await this.pricing.upsertPrice(branchId, price);

    let inventoryReceived = false;
    if (row.openingQuantity > 0) {
      await this.inventory.receive(branchId, actorId, {
        productId,
        quantity: row.openingQuantity,
        reorderLevel: row.reorderLevel,
        batchNo: row.batchNo,
        expiry: row.expiry,
        reason: row.reason ?? 'Bulk medicine import',
      });
      inventoryReceived = true;
    }

    return {
      rowNumber: row.rowNumber,
      name: row.name,
      productId,
      slug: product.slug,
      productCreated: true,
      priceUpdated: true,
      inventoryReceived,
    };
  }

  private toProductInput(row: BulkMedicineImportRowInput): CreateProductInput {
    return {
      name: row.name,
      slug: row.slug,
      sku: row.sku,
      barcode: row.barcode,
      genericName: row.genericName,
      brand: row.brand,
      description: row.description,
      form: row.form,
      strength: row.strength,
      packSize: row.packSize,
      categoryIds: row.categoryIds,
      regulatoryClass: row.regulatoryClass,
      nafdacRegNo: row.nafdacRegNo,
      manufacturer: row.manufacturer,
      status: row.status,
    };
  }

  /**
   * Reads the first sheet twice, because neither view alone is safe:
   *
   * - `text` (raw: false) renders every cell the way it is displayed. Good for everything
   *   textual — notably it preserves leading zeros in SKUs and barcodes.
   * - `typed` (raw: true) returns underlying values, so a date cell arrives as a real Date.
   *
   * The text view MANGLES dates: SheetJS treats `2027-06-05` as a date and re-renders it in
   * US format as `6/5/27`, which is indistinguishable from 5 June vs 6 May. Dates are read
   * from the typed view for that reason; everything else keeps the text view.
   */
  private readRows(file: UploadedMedicineImportFile): {
    text: RawImportRow[];
    typed: RawImportRow[];
  } {
    try {
      const workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) return { text: [], typed: [] };
      const sheet = workbook.Sheets[sheetName];
      return {
        text: XLSX.utils.sheet_to_json<RawImportRow>(sheet, { defval: '', raw: false }),
        typed: XLSX.utils.sheet_to_json<RawImportRow>(sheet, { defval: '', raw: true }),
      };
    } catch {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        'Upload a valid CSV, XLS, or XLSX medicine import file',
      );
    }
  }

  private normalizeRow(
    row: RawImportRow,
    typedRow: RawImportRow,
    rowNumber: number,
    categoryLookup: Map<string, string>,
  ): { values: Record<string, unknown>; errors: RowFieldError[] } {
    const errors: RowFieldError[] = [];

    const regulatoryClass = this.parseRegulatoryClass(
      this.pick(row, ['regulatoryClass', 'regulatory_class', 'class']),
      errors,
    );
    const status = this.parseStatus(this.pick(row, ['status']), errors);
    // Typed view first so a real date cell arrives as a Date, not a US-formatted string.
    const expiryKeys = ['expiry', 'expiryDate', 'expiry_date'];
    const expiry = this.parseExpiry(
      this.pick(typedRow, expiryKeys) ?? this.pick(row, expiryKeys),
      errors,
    );
    const categoryIds = this.resolveCategories(row, categoryLookup, errors);

    const priceKobo = this.moneyToKobo(
      this.pick(row, ['priceKobo', 'price_kobo', 'priceInKobo', 'price_in_kobo']),
    );
    const priceNaira = this.moneyToKobo(
      this.pick(row, ['price', 'priceNaira', 'price_naira', 'sellingPrice', 'selling_price']),
      true,
    );
    const compareAtKobo = this.moneyToKobo(
      this.pick(row, ['compareAtKobo', 'compare_at_kobo', 'comparePriceKobo']),
    );
    const compareAtNaira = this.moneyToKobo(
      this.pick(row, ['compareAt', 'compare_at', 'compareAtNaira', 'compare_at_naira']),
      true,
    );
    const costKobo = this.moneyToKobo(this.pick(row, ['costKobo', 'cost_kobo', 'costPriceKobo']));
    const costNaira = this.moneyToKobo(
      this.pick(row, ['cost', 'costPrice', 'cost_price', 'costNaira', 'cost_naira']),
      true,
    );

    return {
      values: {
        rowNumber,
        name: this.pick(row, ['name', 'medicine', 'product', 'productName', 'product_name']),
        slug: this.optionalText(this.pick(row, ['slug'])),
        sku: this.optionalText(this.pick(row, ['sku', 'skuCode', 'sku_code'])),
        barcode: this.optionalText(this.pick(row, ['barcode', 'ean', 'upc', 'bar_code'])),
        genericName: this.optionalText(this.pick(row, ['genericName', 'generic_name', 'generic'])),
        brand: this.optionalText(this.pick(row, ['brand'])),
        description: this.optionalText(this.pick(row, ['description'])),
        form: this.normalizeLower(this.pick(row, ['form', 'dosageForm', 'dosage_form'])),
        strength: this.optionalText(this.pick(row, ['strength'])),
        packSize: this.optionalText(this.pick(row, ['packSize', 'pack_size', 'pack'])),
        categoryIds,
        regulatoryClass,
        nafdacRegNo: this.optionalText(
          this.pick(row, ['nafdacRegNo', 'nafdac_reg_no', 'nafdac', 'nafdacNumber']),
        ),
        manufacturer: this.optionalText(this.pick(row, ['manufacturer'])),
        status,
        priceKobo: priceKobo ?? priceNaira,
        costKobo: costKobo ?? costNaira,
        compareAtKobo: compareAtKobo ?? compareAtNaira,
        isAvailable: this.booleanValue(
          this.pick(row, ['isAvailable', 'is_available', 'available']),
        ),
        openingQuantity: this.pick(row, [
          'openingQuantity',
          'opening_quantity',
          'quantity',
          'stock',
          'openingStock',
          'opening_stock',
        ]),
        reorderLevel: this.optionalNumber(this.pick(row, ['reorderLevel', 'reorder_level'])),
        batchNo: this.optionalText(this.pick(row, ['batchNo', 'batch_no', 'batch'])),
        expiry,
        reason: this.optionalText(this.pick(row, ['reason', 'note'])),
      },
      errors,
    };
  }

  private pick(row: RawImportRow, candidates: string[]): unknown {
    const normalized = new Map(
      Object.entries(row).map(([key, value]) => [this.normalizeHeader(key), value]),
    );
    for (const candidate of candidates) {
      const value = normalized.get(this.normalizeHeader(candidate));
      if (value !== undefined && this.asText(value) !== '') return value;
    }
    return undefined;
  }

  private normalizeHeader(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private normalizeLower(value: unknown): string | undefined {
    const text = this.optionalText(value);
    return text?.toLowerCase();
  }

  /**
   * Regulatory class decides whether a pharmacist must verify a prescription before the
   * medicine can be dispensed, so it FAILS CLOSED: blank or unrecognised values reject the
   * row rather than quietly falling back to OTC and putting a POM on open sale.
   */
  private parseRegulatoryClass(
    value: unknown,
    errors: RowFieldError[],
  ): RegulatoryClass | undefined {
    const text = this.optionalText(value)?.toUpperCase();
    if (!text) {
      errors.push({
        field: 'regulatoryClass',
        message: `regulatoryClass is required — set it to one of ${REGULATORY_CLASSES.join(', ')}`,
      });
      return undefined;
    }
    const match = REGULATORY_CLASSES.find((cls) => cls === text);
    if (!match) {
      errors.push({
        field: 'regulatoryClass',
        message: `"${this.asText(value)}" is not a valid regulatoryClass — use one of ${REGULATORY_CLASSES.join(', ')}`,
      });
      return undefined;
    }
    return match;
  }

  /** Blank means draft (review before customers see it); a typo is an error, never "published". */
  private parseStatus(value: unknown, errors: RowFieldError[]): ProductStatus {
    const text = this.optionalText(value)?.toLowerCase();
    if (!text) return ProductStatus.DRAFT;
    const match = PRODUCT_STATUSES.find((status) => status === text);
    if (!match) {
      errors.push({
        field: 'status',
        message: `"${this.asText(value)}" is not a valid status — use one of ${PRODUCT_STATUSES.join(', ')}`,
      });
      return ProductStatus.DRAFT;
    }
    return match;
  }

  /**
   * Sheets arrive with `raw: false`, so dates are already locale-formatted strings by the time
   * we see them — `new Date('30/12/2028')` is Invalid Date. Parse the formats a Nigerian
   * pharmacy actually types, plus Excel serial numbers, and reject anything else loudly.
   */
  private parseExpiry(value: unknown, errors: RowFieldError[]): Date | undefined {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;

    const text = this.optionalText(value);
    if (!text) return undefined;

    // ISO first: YYYY-MM-DD (also accepts a trailing time component).
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
    if (iso) {
      return this.utcDate(Number(iso[1]), Number(iso[2]), Number(iso[3]), text, errors);
    }

    // Day-first: DD/MM/YYYY or DD-MM-YYYY.
    const dayFirst = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
    if (dayFirst) {
      return this.utcDate(
        Number(dayFirst[3]),
        Number(dayFirst[2]),
        Number(dayFirst[1]),
        text,
        errors,
      );
    }

    // Excel stores dates as days since 1899-12-30 when a cell slips through as a serial number.
    if (/^\d+(\.\d+)?$/.test(text)) {
      const serial = Number(text);
      if (serial > 0 && serial < 100000) {
        return new Date(Math.round((serial - 25569) * 86400 * 1000));
      }
    }

    errors.push({
      field: 'expiry',
      message: `"${text}" is not a valid expiry date — use YYYY-MM-DD (for example 2027-12-31)`,
    });
    return undefined;
  }

  /** Builds a UTC date and rejects impossible calendar dates like 2027-02-31. */
  private utcDate(
    year: number,
    month: number,
    day: number,
    original: string,
    errors: RowFieldError[],
  ): Date | undefined {
    const date = new Date(Date.UTC(year, month - 1, day));
    const valid =
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day;
    if (!valid) {
      errors.push({
        field: 'expiry',
        message: `"${original}" is not a real calendar date — use YYYY-MM-DD (for example 2027-12-31)`,
      });
      return undefined;
    }
    return date;
  }

  /**
   * Categories come from the client as human names ("Pain Relief"), not ObjectIds. Unknown
   * names are rejected rather than auto-created, so a typo cannot quietly spawn a junk
   * category in the storefront browse tree. Raw ObjectIds still pass through for the
   * internal migration files that already use them.
   */
  private resolveCategories(
    row: RawImportRow,
    lookup: Map<string, string>,
    errors: RowFieldError[],
  ): string[] {
    const raw = this.splitList(
      this.pick(row, ['categoryIds', 'category_ids', 'category', 'categories']),
    );
    if (raw.length === 0) return [];

    const resolved: string[] = [];
    for (const entry of raw) {
      if (/^[a-f\d]{24}$/i.test(entry)) {
        resolved.push(entry);
        continue;
      }
      const id = lookup.get(this.normalizeHeader(entry));
      if (!id) {
        errors.push({
          field: 'category',
          message: `Unknown category "${entry}". Use one of the categories listed in the template, or leave the column blank.`,
        });
        continue;
      }
      resolved.push(id);
    }
    return [...new Set(resolved)];
  }

  /** name/slug → id, keyed the same forgiving way as headers (case and punctuation insensitive). */
  private async loadCategoryLookup(): Promise<Map<string, string>> {
    const categories = await this.catalog.listCategories();
    const lookup = new Map<string, string>();
    for (const category of categories) {
      lookup.set(this.normalizeHeader(category.name), category.id);
      lookup.set(this.normalizeHeader(category.slug), category.id);
    }
    return lookup;
  }

  private splitList(value: unknown): string[] {
    const text = this.asText(value);
    if (!text) return [];
    return text
      .split(/[;,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private moneyToKobo(value: unknown, naira = false): number | undefined {
    const text = this.asText(value).replace(/[,₦\s]/g, '');
    if (!text) return undefined;
    const amount = Number(text);
    if (!Number.isFinite(amount)) return undefined;
    return Math.round(naira ? amount * 100 : amount);
  }

  private booleanValue(value: unknown): boolean {
    const text = this.optionalText(value)?.toLowerCase();
    if (text === 'false' || text === 'no' || text === '0' || text === 'unavailable') return false;
    return true;
  }

  private optionalNumber(value: unknown): number | undefined {
    const text = this.asText(value);
    if (!text) return undefined;
    const number = Number(text);
    return Number.isFinite(number) ? number : undefined;
  }

  private optionalText(value: unknown): string | undefined {
    const text = this.asText(value);
    return text.length > 0 ? text : undefined;
  }

  private asText(value: unknown): string {
    if (value === undefined || value === null) return '';
    return String(value).trim();
  }

  private toRowError(
    rowNumber: number,
    name: string | undefined,
    err: unknown,
  ): BulkMedicineImportRowError {
    if (err instanceof DomainError) {
      return { rowNumber, name, code: err.code, message: err.message };
    }
    return {
      rowNumber,
      name,
      code: ErrorCode.INTERNAL,
      message: err instanceof Error ? err.message : 'Import row failed',
    };
  }
}
