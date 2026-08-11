import { Types } from 'mongoose';
import { ALL_BRANCHES, ErrorCode } from '@lanyard/contracts';

import { AuditQueryService } from './audit-query.service';

function findChain(rows: unknown[]) {
  const exec = jest.fn().mockResolvedValue(rows);
  const limit = jest.fn().mockReturnValue({ exec });
  const sort = jest.fn().mockReturnValue({ limit });
  return { sort, limit, exec };
}

describe('AuditQueryService branch filtering', () => {
  it('rejects an explicit branch outside the caller scope', async () => {
    const service = new AuditQueryService({ find: jest.fn() } as never);

    await expect(
      service.list(
        { branchId: new Types.ObjectId().toString(), limit: 50 },
        [new Types.ObjectId().toString()],
      ),
    ).rejects.toMatchObject({ code: ErrorCode.BRANCH_SCOPE_VIOLATION });
  });

  it('filters all-branch audit queries to the requested branch', async () => {
    const branchId = new Types.ObjectId();
    const chain = findChain([]);
    const find = jest.fn().mockReturnValue(chain);
    const service = new AuditQueryService({ find } as never);

    await service.list({ branchId: branchId.toString(), limit: 50 }, [ALL_BRANCHES]);

    expect(find).toHaveBeenCalledWith(expect.objectContaining({ branchId }));
  });
});
