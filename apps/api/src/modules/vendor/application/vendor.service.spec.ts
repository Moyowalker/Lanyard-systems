import { Types } from 'mongoose';
import { ErrorCode } from '@lanyard/contracts';

import { VendorService } from './vendor.service';

function findChain<T>(value: T) {
  const lean = jest.fn().mockResolvedValue(value);
  const limit = jest.fn().mockReturnValue({ lean });
  const sort = jest.fn().mockReturnValue({ limit });
  return { sort, limit, lean };
}

describe('VendorService', () => {
  it('lists vendors filtered by a case-insensitive name search', async () => {
    const chain = findChain([{ _id: new Types.ObjectId(), name: 'Emzor', isActive: true }]);
    const find = jest.fn().mockReturnValue(chain);
    const service = new VendorService({ find } as never);

    const result = await service.listAdmin({ limit: 20, q: 'emz' } as never);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('Emzor');
    const filter = find.mock.calls[0][0];
    expect(filter.name).toBeInstanceOf(RegExp);
    expect((filter.name as RegExp).test('EMZOR')).toBe(true);
  });

  it('translates a duplicate-name key error into a CONFLICT', async () => {
    const create = jest.fn().mockRejectedValue({ code: 11000 });
    const service = new VendorService({ create } as never);

    await expect(service.create({ name: 'Emzor', isActive: true } as never)).rejects.toMatchObject({
      code: ErrorCode.CONFLICT,
    });
  });

  it('rejects updating a vendor that does not exist', async () => {
    const findByIdAndUpdate = jest.fn().mockResolvedValue(null);
    const service = new VendorService({ findByIdAndUpdate } as never);

    await expect(
      service.update(new Types.ObjectId().toString(), { name: 'X' } as never),
    ).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
  });
});
