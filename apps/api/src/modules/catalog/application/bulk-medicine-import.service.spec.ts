import { Types } from 'mongoose';
import { ErrorCode, ProductStatus, RegulatoryClass } from '@lanyard/contracts';

import { BulkMedicineImportService } from './bulk-medicine-import.service';

/** Builds the service with stubbed collaborators and returns them for assertions. */
function makeService(
  categories: Array<{ id: string; slug: string; name: string }> = [],
  productId = new Types.ObjectId(),
) {
  const catalog = {
    createProduct: jest.fn().mockResolvedValue({ _id: productId, slug: 'stub-slug' }),
    listCategories: jest.fn().mockResolvedValue(categories),
  };
  const pricing = { upsertPrice: jest.fn().mockResolvedValue(undefined) };
  const inventory = { receive: jest.fn().mockResolvedValue(undefined) };
  const service = new BulkMedicineImportService(
    catalog as never,
    pricing as never,
    inventory as never,
  );
  return { service, catalog, pricing, inventory, productId };
}

const csv = (...lines: string[]) => ({
  buffer: Buffer.from(lines.join('\n')),
  originalName: 'medicines.csv',
  mime: 'text/csv',
});

const run = (service: BulkMedicineImportService, file: ReturnType<typeof csv>) =>
  service.importFile('branch-1', 'staff-1', file);

describe('BulkMedicineImportService', () => {
  it('imports valid rows and reports row-level validation errors', async () => {
    const { service, catalog, pricing, inventory, productId } = makeService();

    const result = await run(
      service,
      csv(
        'name,form,regulatoryClass,price,openingQuantity,reorderLevel',
        'Paracetamol 500mg,tablet,OTC,800,10,5',
        'Broken medicine,tablet,OTC,,4,2',
      ),
    );

    expect(result.totalRows).toBe(2);
    expect(result.succeeded).toHaveLength(1);
    expect(result.ok).toBe(false);
    expect(result.failed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rowNumber: 3,
          code: ErrorCode.VALIDATION_FAILED,
          field: 'priceKobo',
        }),
      ]),
    );
    // Naira column is multiplied into kobo.
    expect(pricing.upsertPrice).toHaveBeenCalledWith(
      'branch-1',
      expect.objectContaining({ productId: productId.toString(), priceKobo: 80000 }),
    );
    expect(inventory.receive).toHaveBeenCalledWith(
      'branch-1',
      'staff-1',
      expect.objectContaining({ quantity: 10, reorderLevel: 5 }),
    );
    expect(catalog.createProduct).toHaveBeenCalledTimes(1);
  });

  describe('regulatoryClass fails closed', () => {
    // The critical safety property: a prescription-only medicine must never be created as
    // OTC because of a blank or mistyped cell.
    it.each([
      ['blank', ''],
      ['Rx', 'Rx'],
      ['POM-only', 'POM-only'],
      ['prescription', 'prescription'],
    ])('rejects %s instead of defaulting to OTC', async (_label, value) => {
      const { service, catalog, pricing } = makeService();

      const result = await run(
        service,
        csv('name,form,regulatoryClass,price', `Tramadol 50mg,capsule,${value},1200`),
      );

      expect(result.ok).toBe(false);
      expect(result.succeeded).toHaveLength(0);
      expect(result.failed[0]).toEqual(
        expect.objectContaining({ rowNumber: 2, field: 'regulatoryClass' }),
      );
      // Nothing was written — no product, no price.
      expect(catalog.createProduct).not.toHaveBeenCalled();
      expect(pricing.upsertPrice).not.toHaveBeenCalled();
    });

    it('accepts the valid classes case-insensitively', async () => {
      const { service, catalog } = makeService();

      const result = await run(
        service,
        csv(
          'name,form,regulatoryClass,price',
          'A,tablet,otc,100',
          'B,tablet,pom,200',
          'C,tablet,Controlled,300',
        ),
      );

      expect(result.failed).toHaveLength(0);
      expect(catalog.createProduct.mock.calls.map((c) => c[0].regulatoryClass)).toEqual([
        RegulatoryClass.OTC,
        RegulatoryClass.POM,
        RegulatoryClass.CONTROLLED,
      ]);
    });
  });

  describe('status', () => {
    it('defaults a blank status to draft, not published', async () => {
      const { service, catalog } = makeService();

      await run(service, csv('name,form,regulatoryClass,price', 'A,tablet,OTC,100'));

      expect(catalog.createProduct).toHaveBeenCalledWith(
        expect.objectContaining({ status: ProductStatus.DRAFT }),
      );
    });

    it('rejects an unrecognised status rather than publishing', async () => {
      const { service, catalog } = makeService();

      const result = await run(
        service,
        csv('name,form,regulatoryClass,price,status', 'A,tablet,OTC,100,live'),
      );

      expect(result.failed[0]).toEqual(expect.objectContaining({ field: 'status' }));
      expect(catalog.createProduct).not.toHaveBeenCalled();
    });
  });

  describe('expiry parsing', () => {
    it.each([
      ['ISO', '2027-12-31'],
      ['day-first slashes', '31/12/2027'],
      ['day-first dashes', '31-12-2027'],
    ])('parses %s to the same date', async (_label, value) => {
      const { service, inventory } = makeService();

      const result = await run(
        service,
        csv(
          'name,form,regulatoryClass,price,openingQuantity,batchNo,expiry',
          `A,tablet,OTC,100,5,BATCH-1,${value}`,
        ),
      );

      expect(result.failed).toHaveLength(0);
      const received = inventory.receive.mock.calls[0][2];
      expect(received.expiry.toISOString().slice(0, 10)).toBe('2027-12-31');
    });

    it('rejects unparseable text and impossible calendar dates', async () => {
      const { service } = makeService();

      // These reach the parser as plain strings (SheetJS only auto-converts US-style dates),
      // so the calendar check applies. Note: a cell SheetJS *does* recognise as a date, such
      // as the literal 2027-02-31, is rolled over to 2027-03-03 by the library before we see
      // it — which is why the template forces the expiry column to text format.
      const result = await run(
        service,
        csv(
          'name,form,regulatoryClass,price,openingQuantity,batchNo,expiry',
          'A,tablet,OTC,100,5,BATCH-1,soon',
          'B,tablet,OTC,100,5,BATCH-2,31/02/2027',
          'C,tablet,OTC,100,5,BATCH-3,2027-13-05',
        ),
      );

      expect(result.succeeded).toHaveLength(0);
      expect(result.failed.map((f) => f.field)).toEqual(['expiry', 'expiry', 'expiry']);
    });

    it('requires batchNo and expiry together', async () => {
      const { service } = makeService();

      const result = await run(
        service,
        csv(
          'name,form,regulatoryClass,price,openingQuantity,batchNo',
          'A,tablet,OTC,100,5,BATCH-1',
        ),
      );

      expect(result.ok).toBe(false);
      expect(result.failed.map((f) => f.field).sort()).toEqual(['batchNo', 'expiry']);
    });
  });

  describe('category resolution', () => {
    const painRelief = new Types.ObjectId().toString();
    const cats = [{ id: painRelief, slug: 'pain-relief', name: 'Pain Relief' }];

    it('resolves a human category name to its id, ignoring case and punctuation', async () => {
      const { service, catalog } = makeService(cats);

      const result = await run(
        service,
        csv('name,form,regulatoryClass,price,category', 'A,tablet,OTC,100,pain relief'),
      );

      expect(result.failed).toHaveLength(0);
      expect(catalog.createProduct).toHaveBeenCalledWith(
        expect.objectContaining({ categoryIds: [painRelief] }),
      );
      // One lookup for the whole file, not one per row.
      expect(catalog.listCategories).toHaveBeenCalledTimes(1);
    });

    it('rejects an unknown category instead of creating one', async () => {
      const { service, catalog } = makeService(cats);

      const result = await run(
        service,
        csv('name,form,regulatoryClass,price,category', 'A,tablet,OTC,100,Painkillers'),
      );

      expect(result.failed[0]).toEqual(
        expect.objectContaining({ field: 'category', rowNumber: 2 }),
      );
      expect(catalog.createProduct).not.toHaveBeenCalled();
    });

    it('still accepts raw ObjectIds for internal migration files', async () => {
      const { service, catalog } = makeService(cats);

      await run(
        service,
        csv('name,form,regulatoryClass,price,categoryIds', `A,tablet,OTC,100,${painRelief}`),
      );

      expect(catalog.createProduct).toHaveBeenCalledWith(
        expect.objectContaining({ categoryIds: [painRelief] }),
      );
    });
  });

  it('rejects an oversized file rather than timing out part-way', async () => {
    const { service } = makeService();
    const rows = Array.from({ length: 2001 }, (_, i) => `Medicine ${i},tablet,OTC,100`);

    await expect(run(service, csv('name,form,regulatoryClass,price', ...rows))).rejects.toThrow(
      /exceeds the 2000-row limit/,
    );
  });

  it('rejects a file with no rows', async () => {
    const { service } = makeService();

    await expect(run(service, csv('name,form,regulatoryClass,price'))).rejects.toThrow(
      /no medicine rows/,
    );
  });
});
