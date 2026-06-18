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
    const rawRows = this.readRows(file);
    if (rawRows.length === 0) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Import file has no medicine rows');
    }

    const succeeded: BulkMedicineImportRowResult[] = [];
    const failed: BulkMedicineImportRowError[] = [];

    for (const [index, rawRow] of rawRows.entries()) {
      const rowNumber = index + 2;
      const parsed = BulkMedicineImportRowSchema.safeParse(this.normalizeRow(rawRow, rowNumber));
      if (!parsed.success) {
        failed.push(
          ...parsed.error.issues.map((issue) => ({
            rowNumber,
            name: this.asText(this.pick(rawRow, ['name', 'medicine', 'product'])) || undefined,
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

  private readRows(file: UploadedMedicineImportFile): RawImportRow[] {
    try {
      const workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) return [];
      return XLSX.utils.sheet_to_json<RawImportRow>(workbook.Sheets[sheetName], {
        defval: '',
        raw: false,
      });
    } catch {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        'Upload a valid CSV, XLS, or XLSX medicine import file',
      );
    }
  }

  private normalizeRow(row: RawImportRow, rowNumber: number): Record<string, unknown> {
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

    return {
      rowNumber,
      name: this.pick(row, ['name', 'medicine', 'product', 'productName', 'product_name']),
      slug: this.optionalText(this.pick(row, ['slug'])),
      genericName: this.optionalText(this.pick(row, ['genericName', 'generic_name', 'generic'])),
      brand: this.optionalText(this.pick(row, ['brand'])),
      description: this.optionalText(this.pick(row, ['description'])),
      form: this.normalizeLower(this.pick(row, ['form', 'dosageForm', 'dosage_form'])),
      strength: this.optionalText(this.pick(row, ['strength'])),
      packSize: this.optionalText(this.pick(row, ['packSize', 'pack_size', 'pack'])),
      categoryIds: this.splitList(this.pick(row, ['categoryIds', 'category_ids'])),
      regulatoryClass: this.normalizeRegulatoryClass(
        this.pick(row, ['regulatoryClass', 'regulatory_class', 'class']),
      ),
      nafdacRegNo: this.optionalText(
        this.pick(row, ['nafdacRegNo', 'nafdac_reg_no', 'nafdac', 'nafdacNumber']),
      ),
      manufacturer: this.optionalText(this.pick(row, ['manufacturer'])),
      status: this.normalizeStatus(this.pick(row, ['status'])),
      priceKobo: priceKobo ?? priceNaira,
      compareAtKobo: compareAtKobo ?? compareAtNaira,
      isAvailable: this.booleanValue(this.pick(row, ['isAvailable', 'is_available', 'available'])),
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
      expiry: this.optionalText(this.pick(row, ['expiry', 'expiryDate', 'expiry_date'])),
      reason: this.optionalText(this.pick(row, ['reason', 'note'])),
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

  private normalizeRegulatoryClass(value: unknown): RegulatoryClass {
    const text = this.optionalText(value)?.toUpperCase();
    if (text === RegulatoryClass.POM || text === RegulatoryClass.CONTROLLED) return text;
    return RegulatoryClass.OTC;
  }

  private normalizeStatus(value: unknown): ProductStatus {
    const text = this.optionalText(value)?.toLowerCase();
    if (text === ProductStatus.DRAFT || text === ProductStatus.ARCHIVED) return text;
    return ProductStatus.PUBLISHED;
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
