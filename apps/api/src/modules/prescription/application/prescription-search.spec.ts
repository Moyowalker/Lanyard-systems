import { Types } from 'mongoose';
import { RxStatus } from '@lanyard/contracts';

import { PrescriptionService } from './prescription.service';

/** A chainable query mock supporting `.select().limit().lean()` and `.select().lean()`. */
function chain(value: unknown) {
  const o: Record<string, unknown> = {};
  o.select = () => o;
  o.limit = () => o;
  o.lean = () => Promise.resolve(value);
  return o;
}

function build(models: {
  rxFind: jest.Mock;
  customerFind: jest.Mock;
  orderFindOne: jest.Mock;
  orderFind?: jest.Mock;
}) {
  return new PrescriptionService(
    { find: models.rxFind } as never,
    {} as never, // staffModel
    { find: models.customerFind } as never,
    { findOne: models.orderFindOne, find: models.orderFind ?? jest.fn() } as never,
    {} as never, // avQueue
    {} as never, // orders
    {} as never, // notifications
    {} as never, // audit
    {} as never, // storage
  );
}

describe('PrescriptionService.searchAdmin (recall)', () => {
  it('finds a VERIFIED prescription by customer phone (queue-excluded status included)', async () => {
    const customerId = new Types.ObjectId();
    const rxDoc = {
      _id: new Types.ObjectId(),
      customerId,
      linkedOrderIds: [] as Types.ObjectId[],
      files: [{}],
      status: RxStatus.VERIFIED,
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
    };
    const customerFind = jest
      .fn()
      // 1) resolve phone → customerId
      .mockReturnValueOnce(chain([{ _id: customerId }]))
      // 2) enrich rows → customer name/phone
      .mockReturnValueOnce(
        chain([{ _id: customerId, firstName: 'Ada', lastName: 'Obi', phone: '+2348012345678' }]),
      );
    const rxFind = jest.fn().mockReturnValue({
      sort: () => ({ limit: () => Promise.resolve([rxDoc]) }),
    });
    const orderFindOne = jest.fn().mockReturnValue(chain(null));

    const service = build({ rxFind, customerFind, orderFindOne });

    const result = await service.searchAdmin(['ALL'], {
      q: '+2348012345678',
      limit: 20,
    } as never);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].status).toBe(RxStatus.VERIFIED);
    expect(result.data[0].customerName).toBe('Ada Obi');
    expect(result.data[0].customerPhone).toBe('+2348012345678');
    expect(result.data[0].fileCount).toBe(1);
  });

  it('finds prescriptions by order number', async () => {
    const orderId = new Types.ObjectId();
    const rxId = new Types.ObjectId();
    const customerId = new Types.ObjectId();
    const rxDoc = {
      _id: rxId,
      customerId,
      linkedOrderIds: [orderId],
      files: [{}, {}],
      status: RxStatus.REJECTED,
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
    };
    const customerFind = jest
      .fn()
      // 1) phone resolve → no phone match
      .mockReturnValueOnce(chain([]))
      // 2) enrich
      .mockReturnValueOnce(chain([{ _id: customerId, firstName: 'Ben', phone: '+2348099999999' }]));
    const orderFindOne = jest
      .fn()
      .mockReturnValue(chain({ _id: orderId, prescriptionIds: [rxId] }));
    const orderFind = jest.fn().mockReturnValue(chain([{ _id: orderId, orderNo: 'LP-2201' }]));
    const rxFind = jest.fn().mockReturnValue({
      sort: () => ({ limit: () => Promise.resolve([rxDoc]) }),
    });

    const service = build({ rxFind, customerFind, orderFindOne, orderFind });

    const result = await service.searchAdmin(['ALL'], { q: 'LP-2201', limit: 20 } as never);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].orderNos).toEqual(['LP-2201']);
    expect(result.data[0].fileCount).toBe(2);
  });
});
