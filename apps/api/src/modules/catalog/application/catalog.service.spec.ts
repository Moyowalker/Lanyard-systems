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
  const pricing = {
    getPriceMap: jest.fn().mockResolvedValue(new Map()),
    getPricedProductIds: jest.fn(),
    upsertPrice: jest.fn(),
  } as never;
  const inventory = { getAvailabilityMap: jest.fn().mockResolvedValue(new Map()) } as never;
  const storage = { getSignedDownloadUrl: jest.fn() } as never;
  const audit = { record: jest.fn() } as never;
  const tx = { run: jest.fn() } as never;
  return new CatalogService(productModel, categoryModel, pricing, inventory, storage, audit, tx);
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

describe('CatalogService branch catalog pagination', () => {
  it('filters to branch-priced products before applying the page limit', async () => {
    const pricedProduct = new Types.ObjectId();
    const rows = [
      {
        _id: pricedProduct,
        slug: 'priced-medicine',
        name: 'Priced Medicine',
        form: 'tablet',
        regulatoryClass: 'OTC',
      },
    ];
    const find = jest.fn().mockReturnValueOnce(chain(() => Promise.resolve(rows)));
    const service = buildService(find);
    const pricing = (
      service as unknown as { pricing: { getPricedProductIds: jest.Mock; getPriceMap: jest.Mock } }
    ).pricing;
    pricing.getPricedProductIds.mockResolvedValue([pricedProduct]);
    pricing.getPriceMap.mockResolvedValue(
      new Map([
        [pricedProduct.toString(), { priceKobo: 10000, currency: 'NGN', isAvailable: true }],
      ]),
    );

    const result = await service.listProducts({ branchId: '6a733cb323c9dd5bda0d8945', limit: 20 });

    expect(find).toHaveBeenCalledWith(expect.objectContaining({ _id: { $in: [pricedProduct] } }));
    expect(result.data).toHaveLength(1);
    expect(result.data[0].slug).toBe('priced-medicine');
  });

  it('returns every branch-available product across cursor pages without duplication', async () => {
    const first = new Types.ObjectId();
    const second = new Types.ObjectId();
    const third = new Types.ObjectId();
    const rows = [first, second, third].map((id, index) => ({
      _id: id,
      slug: `medicine-${index + 1}`,
      name: `Medicine ${index + 1}`,
      form: 'tablet',
      regulatoryClass: 'OTC',
    }));
    const find = jest.fn((filter: { _id?: { $gt?: string } }) => {
      const after = filter._id?.$gt;
      const start = after ? rows.findIndex((row) => row._id.toString() === after) + 1 : 0;
      return chain(() => Promise.resolve(rows.slice(start)));
    });
    const service = buildService(find);
    const pricing = (
      service as unknown as { pricing: { getPricedProductIds: jest.Mock; getPriceMap: jest.Mock } }
    ).pricing;
    pricing.getPricedProductIds.mockResolvedValue([first, second, third]);
    pricing.getPriceMap.mockResolvedValue(
      new Map(
        [first, second, third].map((id) => [
          id.toString(),
          { priceKobo: 10000, currency: 'NGN', isAvailable: true },
        ]),
      ),
    );

    const pageOne = await service.listProducts({
      branchId: '6a733cb323c9dd5bda0d8945',
      limit: 2,
    });
    const pageTwo = await service.listProducts({
      branchId: '6a733cb323c9dd5bda0d8945',
      limit: 2,
      cursor: pageOne.meta.nextCursor ?? undefined,
    });

    expect(pageOne.data.map((row) => row.id)).toEqual([first.toString(), second.toString()]);
    expect(pageTwo.data.map((row) => row.id)).toEqual([third.toString()]);
    expect(pageTwo.meta.nextCursor).toBeNull();
  });
});
