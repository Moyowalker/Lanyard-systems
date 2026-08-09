import { Types } from 'mongoose';

import { OrderService } from './order.service';

function listChain() {
  const limit = jest.fn().mockResolvedValue([]);
  const sort = jest.fn().mockReturnValue({ limit });
  return { limit, sort };
}

describe('OrderService branch filter', () => {
  it('narrows an assigned staff member to the requested branch and rejects another branch', async () => {
    const assignedBranchId = new Types.ObjectId().toString();
    const otherBranchId = new Types.ObjectId().toString();
    const firstList = listChain();
    const secondList = listChain();
    const find = jest.fn().mockReturnValueOnce(firstList).mockReturnValueOnce(secondList);
    const service = new OrderService(
      { find } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.listAdmin({ limit: 20, branchId: assignedBranchId }, [assignedBranchId]);
    await service.listAdmin({ limit: 20, branchId: otherBranchId }, [assignedBranchId]);

    expect((find.mock.calls[0][0].branchId as Types.ObjectId).toString()).toBe(assignedBranchId);
    expect((find.mock.calls[1][0].branchId as Types.ObjectId).toString()).toBe(
      '000000000000000000000000',
    );
  });
});