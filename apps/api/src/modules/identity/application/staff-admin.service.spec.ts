import { Types } from 'mongoose';
import { ErrorCode, RoleKey } from '@lanyard/contracts';

import { StaffAdminService } from './staff-admin.service';
import { DomainError } from '../../../core/errors/domain-error';

/** Builds a roleModel whose find().select().lean() resolves to the given roles. */
function roleModelReturning(roles: Array<{ _id: Types.ObjectId; key: string; name: string }>) {
  return {
    find: jest.fn().mockReturnValue({
      select: () => ({ lean: () => Promise.resolve(roles) }),
    }),
  };
}

function principal(roles: string[]) {
  return {
    sub: 'me',
    realm: 'staff' as const,
    roles,
    permissions: [],
    branchScope: ['ALL'],
    sessionId: 's',
  };
}

describe('StaffAdminService — privilege escalation guard', () => {
  it('blocks a non-super-admin from granting the SUPER_ADMIN role', async () => {
    const superRoleId = new Types.ObjectId();
    const staffModel = { create: jest.fn() };
    const roleModel = roleModelReturning([
      { _id: superRoleId, key: RoleKey.SUPER_ADMIN, name: 'Super Admin' },
    ]);
    const passwords = { hash: jest.fn() };
    const audit = { record: jest.fn() };

    const service = new StaffAdminService(
      staffModel as never,
      roleModel as never,
      passwords as never,
      audit as never,
    );

    await expect(
      service.create(principal([RoleKey.ADMIN]) as never, {
        email: 'x@lanyard.test',
        firstName: 'A',
        lastName: 'B',
        password: 'a-strong-password',
        roleIds: [superRoleId.toString()],
        branchScope: ['ALL'],
      }),
    ).rejects.toMatchObject<Partial<DomainError>>({ code: ErrorCode.FORBIDDEN });

    // Guard fires before any write or password hashing.
    expect(staffModel.create).not.toHaveBeenCalled();
    expect(passwords.hash).not.toHaveBeenCalled();
  });

  it('allows a super-admin to grant the SUPER_ADMIN role (passes the guard)', async () => {
    const superRoleId = new Types.ObjectId();
    const roleModel = roleModelReturning([
      { _id: superRoleId, key: RoleKey.SUPER_ADMIN, name: 'Super Admin' },
    ]);
    // create() throws after the guard (no real DB), so we only assert the guard didn't block.
    const staffModel = { create: jest.fn().mockRejectedValue(new Error('db-not-wired')) };
    const passwords = { hash: jest.fn().mockResolvedValue('hash') };
    const audit = { record: jest.fn() };

    const service = new StaffAdminService(
      staffModel as never,
      roleModel as never,
      passwords as never,
      audit as never,
    );

    await expect(
      service.create(principal([RoleKey.SUPER_ADMIN]) as never, {
        email: 'y@lanyard.test',
        firstName: 'A',
        lastName: 'B',
        password: 'a-strong-password',
        roleIds: [superRoleId.toString()],
        branchScope: ['ALL'],
      }),
    ).rejects.toThrow('db-not-wired'); // got past the guard to the (mocked) write

    expect(passwords.hash).toHaveBeenCalled();
  });
});
