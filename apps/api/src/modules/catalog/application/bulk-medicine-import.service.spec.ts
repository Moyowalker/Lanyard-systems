import { Types } from 'mongoose';
import { ErrorCode } from '@lanyard/contracts';

import { BulkMedicineImportService } from './bulk-medicine-import.service';

describe('BulkMedicineImportService', () => {
  it('imports valid CSV rows and returns row-level validation errors', async () => {
    const productId = new Types.ObjectId();
    const catalog = {
      createProduct: jest.fn().mockResolvedValue({
        _id: productId,
        slug: 'paracetamol-500mg',
      }),
    };
    const pricing = { upsertPrice: jest.fn().mockResolvedValue(undefined) };
    const inventory = { receive: jest.fn().mockResolvedValue(undefined) };
    const service = new BulkMedicineImportService(
      catalog as never,
      pricing as never,
      inventory as never,
    );

    const csv = [
      'name,form,price,openingQuantity,reorderLevel',
      'Paracetamol 500mg,tablet,800,10,5',
      'Broken medicine,tablet,,4,2',
    ].join('\n');

    const result = await service.importFile('branch-1', 'staff-1', {
      buffer: Buffer.from(csv),
      originalName: 'medicines.csv',
      mime: 'text/csv',
    });

    expect(result.ok).toBe(false);
    expect(result.totalRows).toBe(2);
    expect(result.succeeded).toHaveLength(1);
    expect(result.failed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rowNumber: 3,
          code: ErrorCode.VALIDATION_FAILED,
          field: 'priceKobo',
        }),
      ]),
    );
    expect(catalog.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Paracetamol 500mg',
        form: 'tablet',
      }),
    );
    expect(pricing.upsertPrice).toHaveBeenCalledWith('branch-1', {
      productId: productId.toString(),
      priceKobo: 80000,
      compareAtKobo: undefined,
      isAvailable: true,
    });
    expect(inventory.receive).toHaveBeenCalledWith(
      'branch-1',
      'staff-1',
      expect.objectContaining({
        productId: productId.toString(),
        quantity: 10,
        reorderLevel: 5,
      }),
    );
  });
});
