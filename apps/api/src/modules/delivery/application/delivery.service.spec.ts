import { Types } from 'mongoose';

import { DeliveryService } from './delivery.service';

function listChain() {
  const lean = jest.fn().mockResolvedValue([]);
  const limit = jest.fn().mockReturnValue({ lean });
  const sort = jest.fn().mockReturnValue({ limit });
  return { lean, limit, sort };
}

describe('DeliveryService branch filter', () => {
  it('limits the delivery board to a permitted branch and hides an out-of-scope branch', async () => {
    const assignedBranchId = new Types.ObjectId().toString();
    const otherBranchId = new Types.ObjectId().toString();
    const firstList = listChain();
    const secondList = listChain();
    const find = jest.fn().mockReturnValueOnce(firstList).mockReturnValueOnce(secondList);
    const service = new DeliveryService(
      { find: jest.fn().mockResolvedValue([]) } as never,
      { find } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.board([assignedBranchId], assignedBranchId);
    await service.board([assignedBranchId], otherBranchId);

    expect((find.mock.calls[0][0].branchId as Types.ObjectId).toString()).toBe(assignedBranchId);
    expect((find.mock.calls[1][0].branchId as Types.ObjectId).toString()).toBe(
      '000000000000000000000000',
    );
  });
  it('includes the delivery contact phone in a board item', async () => {
    const chain = listChain();
    const orderId = new Types.ObjectId();
    chain.lean.mockResolvedValueOnce([
      {
        _id: orderId,
        orderNo: 'LNY-TEST123',
        status: 'FULFILLING',
        totals: { totalKobo: 800000, deliveryKobo: 400000 },
        fulfillment: {
          address: {
            line1: '1 Test Street',
            city: 'Lagos',
            state: 'Lagos',
            contactPhone: '+2348012345678',
          },
        },
        createdAt: new Date('2026-09-23T10:00:00.000Z'),
      },
    ]);
    const service = new DeliveryService(
      { find: jest.fn().mockResolvedValue([]) } as never,
      { find: jest.fn().mockReturnValue(chain) } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const board = await service.board(['ALL']);

    expect(board.data[0].address?.contactPhone).toBe('+2348012345678');
  });

  it('falls back to the customer profile phone when the address has none', async () => {
    const chain = listChain();
    const orderId = new Types.ObjectId();
    const customerId = new Types.ObjectId();
    chain.lean.mockResolvedValueOnce([
      {
        _id: orderId,
        customerId,
        orderNo: 'LNY-TEST456',
        status: 'FULFILLING',
        totals: { totalKobo: 800000, deliveryKobo: 400000 },
        fulfillment: { address: { line1: '1 Test Street', city: 'Lagos', state: 'Lagos' } },
        createdAt: new Date('2026-09-23T10:00:00.000Z'),
      },
    ]);
    const customerLean = jest.fn().mockResolvedValue([{ _id: customerId, phone: '+2348012345678' }]);
    const customerModel = {
      find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: customerLean }) }),
    };
    const service = new DeliveryService(
      { find: jest.fn().mockResolvedValue([]) } as never,
      { find: jest.fn().mockReturnValue(chain) } as never,
      customerModel as never,
      {} as never,
      {} as never,
    );

    const board = await service.board(['ALL']);

    expect(board.data[0].address?.contactPhone).toBe('+2348012345678');
  });
});

import { DeliveryStatus, OrderStatus } from '@lanyard/contracts';
import { mapDeliveryAction } from './delivery.service';

describe('mapDeliveryAction', () => {
  it('out_for_delivery drives the order to OUT_FOR_DELIVERY', () => {
    expect(mapDeliveryAction('out_for_delivery')).toEqual({
      deliveryStatus: DeliveryStatus.OUT_FOR_DELIVERY,
      orderTarget: OrderStatus.OUT_FOR_DELIVERY,
    });
  });

  it('delivered completes the order (reusing the dispense path)', () => {
    expect(mapDeliveryAction('delivered')).toEqual({
      deliveryStatus: DeliveryStatus.DELIVERED,
      orderTarget: OrderStatus.COMPLETED,
    });
  });

  it('failed does NOT move the order (staff can re-dispatch)', () => {
    expect(mapDeliveryAction('failed')).toEqual({
      deliveryStatus: DeliveryStatus.FAILED,
      orderTarget: null,
    });
  });
});
