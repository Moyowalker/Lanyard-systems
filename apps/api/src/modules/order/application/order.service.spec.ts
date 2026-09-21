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

  it('uses newest-first pagination with status, order-number, and date filters', async () => {
    const list = listChain();
    const find = jest.fn().mockReturnValue(list);
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
    const branchId = new Types.ObjectId().toString();
    const from = new Date('2026-09-01T00:00:00.000Z');
    const to = new Date('2026-09-21T23:59:59.999Z');

    await service.listAdmin(
      { branchId, limit: 20, status: 'completed', q: 'LNY-42', from, to } as never,
      [branchId],
    );

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        orderNo: { $regex: 'LNY-42', $options: 'i' },
        createdAt: { $gte: from, $lte: to },
      }),
    );
    expect(list.sort).toHaveBeenCalledWith({ _id: -1 });
  });

  it('filters grouped operational views with a server-side status set', async () => {
    const list = listChain();
    const find = jest.fn().mockReturnValue(list);
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
    const branchId = new Types.ObjectId().toString();

    await service.listAdmin(
      { branchId, limit: 20, statuses: ['PAID', 'FULFILLING'] } as never,
      [branchId],
    );

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ status: { $in: ['PAID', 'FULFILLING'] } }),
    );
  });
});