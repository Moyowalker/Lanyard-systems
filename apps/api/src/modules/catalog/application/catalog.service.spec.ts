import { Types } from 'mongoose';

import { CatalogService } from './catalog.service';

/** A `find(...).sort(...).limit(...).lean()` chain whose `lean()` runs `leanImpl`. */
function chain(leanImpl: () => Promise<unknown>) {
  const obj: Record<string, unknown> = {};
  obj.sort = () => obj;
  obj.limit = () => obj;
  obj.lean = leanImpl;
  return obj;
}

function buildService(productFind: jest.Mock) {
  const productModel = { find: productFind } as never;
  const categoryModel = { findOne: jest.fn() } as never;
  const pricing = { getPriceMap: jest.fn(), upsertPrice: jest.fn() } as never;
  const inventory = { getAvailabilityMap: jest.fn() } as never;
  const storage = { getSignedDownloadUrl: jest.fn() } as never;
  return new CatalogService(productModel, categoryModel, pricing, inventory, storage);
}

describe('CatalogService search resilience', () => {
  const productA = new Types.ObjectId();

  it('falls back to a substring match when the $text query throws (missing/conflicted index)', async () => {
    const rows = [
      {
        _id: productA,
        slug: 'para',
        name: 'Paracetamol 500mg',
        form: 'tablet',
        regulatoryClass: 'GSL',
      },
    ];
    const find = jest
      .fn()
      // First: the $text query throws (as a missing/conflicted product_text index does).
      .mockReturnValueOnce(chain(() => Promise.reject(new Error('text index unavailable'))))
      // Then: the substring fallback returns rows.
      .mockReturnValueOnce(chain(() => Promise.resolve(rows)));
    const service = buildService(find);

    const result = await service.search({ q: 'para', limit: 10 } as never);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('Paracetamol 500mg');
    expect(find).toHaveBeenCalledTimes(2);
  });

  it('barcode exact-match lookup does not go through the text/substring path', async () => {
    const rows = [
      {
        _id: productA,
        slug: 'barcoded',
        name: 'Barcoded Drug',
        form: 'tablet',
        regulatoryClass: 'GSL',
        barcode: '12345',
      },
    ];
    // Barcode path is `find(...).limit(2).lean()` — no sort, single call, no fallback.
    const find = jest.fn().mockReturnValueOnce({
      limit: () => ({ lean: () => Promise.resolve(rows) }),
    });
    const service = buildService(find);

    const result = await service.listProductsForPos({ barcode: '12345', limit: 10 } as never);

    expect(result.data[0].name).toBe('Barcoded Drug');
    expect(find).toHaveBeenCalledTimes(1);
  });
});
