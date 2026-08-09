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
    );

    await service.board([assignedBranchId], assignedBranchId);
    await service.board([assignedBranchId], otherBranchId);

    expect((find.mock.calls[0][0].branchId as Types.ObjectId).toString()).toBe(assignedBranchId);
    expect((find.mock.calls[1][0].branchId as Types.ObjectId).toString()).toBe(
      '000000000000000000000000',
    );
  });
});import { DeliveryStatus, OrderStatus } from '@lanyard/contracts';
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
