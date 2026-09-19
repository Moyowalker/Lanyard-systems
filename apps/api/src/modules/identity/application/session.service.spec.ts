import { Types } from 'mongoose';

import { ErrorCode, PrincipalType } from '@lanyard/contracts';

import { SessionService } from './session.service';

describe('SessionService', () => {
  const tokens = {
    newRefreshToken: jest.fn(() => 'refresh-token'),
  };

  it('issues sessions without an expiry deadline', async () => {
    const create = jest.fn().mockImplementation(async (doc) => ({ _id: new Types.ObjectId(), ...doc }));
    const service = new SessionService({ create } as never, tokens as never);

    await service.issue(new Types.ObjectId(), PrincipalType.STAFF);

    const issued = create.mock.calls[0][0];
    expect(issued.lastActivityAt).toBeInstanceOf(Date);
    expect(issued).not.toHaveProperty('expiresAt');
    expect(issued).not.toHaveProperty('inactivityExpiresAt');
  });

  it('rotates sessions with legacy expiry fields without enforcing them', async () => {
    const session = {
      _id: new Types.ObjectId(),
      principalId: new Types.ObjectId(),
      principalType: PrincipalType.STAFF,
      familyId: 'family',
      expiresAt: new Date(Date.now() - 1),
      inactivityExpiresAt: new Date(Date.now() - 1),
      revokedAt: undefined as Date | undefined,
      save: jest.fn().mockResolvedValue(undefined),
    };
    const create = jest.fn().mockResolvedValue({ _id: new Types.ObjectId() });
    const service = new SessionService(
      {
        findOne: jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(session) }),
        create,
      } as never,
      tokens as never,
    );

    await expect(service.rotate('refresh-token')).resolves.toMatchObject({ familyId: 'family' });
    expect(session.save).toHaveBeenCalled();
    expect(session.revokedAt).toBeInstanceOf(Date);
    expect(create.mock.calls[0][0]).not.toHaveProperty('expiresAt');
    expect(create.mock.calls[0][0]).not.toHaveProperty('inactivityExpiresAt');
  });

  it('rejects explicitly revoked sessions', async () => {
    const session = {
      _id: new Types.ObjectId(),
      principalId: new Types.ObjectId(),
      principalType: PrincipalType.STAFF,
      familyId: 'family',
      revokedAt: new Date(),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const updateMany = jest.fn().mockResolvedValue(undefined);
    const service = new SessionService(
      {
        findOne: jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(session) }),
        updateMany,
      } as never,
      tokens as never,
    );

    await expect(service.rotate('refresh-token')).rejects.toMatchObject({ code: ErrorCode.REFRESH_REUSE_DETECTED });
    expect(updateMany).toHaveBeenCalledWith(
      { familyId: 'family' },
      { $set: { revokedAt: expect.any(Date) } },
    );
  });
});