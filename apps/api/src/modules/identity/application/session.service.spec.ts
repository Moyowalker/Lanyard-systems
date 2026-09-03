import { Types } from 'mongoose';

import { ErrorCode, PrincipalType } from '@lanyard/contracts';

import { SessionService } from './session.service';

describe('SessionService inactivity timeout', () => {
  const tokens = {
    newRefreshToken: jest.fn(() => 'refresh-token'),
    refreshTtlMs: 30 * 24 * 60 * 60 * 1000,
  };

  it('issues sessions with a 60-minute inactivity deadline', async () => {
    const create = jest.fn().mockImplementation(async (doc) => ({ _id: new Types.ObjectId(), ...doc }));
    const service = new SessionService({ create } as never, tokens as never);
    const before = Date.now();

    await service.issue(new Types.ObjectId(), PrincipalType.STAFF);

    const issued = create.mock.calls[0][0];
    expect(issued.lastActivityAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(issued.inactivityExpiresAt.getTime() - issued.lastActivityAt.getTime()).toBe(60 * 60 * 1000);
  });

  it('rejects refresh after the inactivity deadline and revokes the session', async () => {
    const session = {
      _id: new Types.ObjectId(),
      principalId: new Types.ObjectId(),
      principalType: PrincipalType.STAFF,
      familyId: 'family',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      inactivityExpiresAt: new Date(Date.now() - 1),
      revokedAt: undefined as Date | undefined,
      save: jest.fn().mockResolvedValue(undefined),
    };
    const service = new SessionService(
      { findOne: jest.fn().mockReturnValue({ select: jest.fn().mockResolvedValue(session) }) } as never,
      tokens as never,
    );

    await expect(service.rotate('refresh-token')).rejects.toMatchObject({ code: ErrorCode.SESSION_INVALID });
    expect(session.save).toHaveBeenCalled();
    expect(session.revokedAt).toBeInstanceOf(Date);
  });

  it('allows a legacy session without inactivity fields to refresh', async () => {
    const session = {
      _id: new Types.ObjectId(),
      principalId: new Types.ObjectId(),
      principalType: PrincipalType.STAFF,
      familyId: 'family',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
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
    expect(create.mock.calls[0][0].inactivityExpiresAt).toBeInstanceOf(Date);
  });
});