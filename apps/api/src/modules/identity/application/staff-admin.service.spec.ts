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
      {} as never,
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
      {} as never,
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

describe('StaffAdminService — account updates and deletion', () => {
  it('reports a conflict when changing an email to one already in use', async () => {
    const staff = {
      _id: new Types.ObjectId(),
      save: jest.fn().mockRejectedValue({ code: 11000 }),
    };
    const service = new StaffAdminService(
      { findById: jest.fn().mockResolvedValue(staff) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.update(principal([]) as never, staff._id.toString(), { email: 'duplicate@lanyard.test' }),
    ).rejects.toMatchObject<Partial<DomainError>>({ code: ErrorCode.CONFLICT });
    expect(staff.save).toHaveBeenCalled();
  });

  it('suspends deleted staff, revokes active sessions, and audits the removal', async () => {
    const staff = {
      _id: new Types.ObjectId(),
      email: 'kosisochukwu@lanyard.test',
      save: jest.fn().mockResolvedValue(undefined),
    };
    const updateMany = jest.fn().mockResolvedValue(undefined);
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new StaffAdminService(
      { findById: jest.fn().mockResolvedValue(staff) } as never,
      { updateMany } as never,
      {} as never,
      {} as never,
      audit as never,
    );

    await service.softDelete(principal([]) as never, staff._id.toString());

    expect(staff.save).toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ principalId: staff._id, revokedAt: { $exists: false } }),
      expect.objectContaining({ $set: expect.objectContaining({ revokedAt: expect.any(Date) }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'staff.delete', targetId: staff._id.toString() }),
    );
  });

  it('does not allow a staff member to delete their own account', async () => {
    const service = new StaffAdminService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.softDelete(principal([]) as never, 'me')).rejects.toMatchObject<
      Partial<DomainError>
    >({ code: ErrorCode.FORBIDDEN });
  });
});
