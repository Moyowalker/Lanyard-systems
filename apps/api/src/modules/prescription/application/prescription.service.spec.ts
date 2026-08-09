import { Types } from 'mongoose';

import { PrescriptionService } from './prescription.service';

function listChain() {
  const limit = jest.fn().mockResolvedValue([]);
  const sort = jest.fn().mockReturnValue({ limit });
  return { limit, sort };
}

describe('PrescriptionService branch filter', () => {
  it('applies the selected branch to queue queries without widening the caller scope', async () => {
    const assignedBranchId = new Types.ObjectId().toString();
    const otherBranchId = new Types.ObjectId().toString();
    const firstList = listChain();
    const secondList = listChain();
    const find = jest.fn().mockReturnValueOnce(firstList).mockReturnValueOnce(secondList);
    const service = new PrescriptionService(
      { find } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.queue([assignedBranchId], { limit: 20, branchId: assignedBranchId });
    await service.queue([assignedBranchId], { limit: 20, branchId: otherBranchId });

    expect((find.mock.calls[0][0].branchId as Types.ObjectId).toString()).toBe(assignedBranchId);
    expect((find.mock.calls[1][0].branchId as Types.ObjectId).toString()).toBe(
      '000000000000000000000000',
    );
  });
});