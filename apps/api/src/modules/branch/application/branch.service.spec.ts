import { Types } from 'mongoose';

import { ALL_BRANCHES, ErrorCode } from '@lanyard/contracts';

import { BranchService } from './branch.service';
import { DomainError } from '../../../core/errors/domain-error';

function listChain<T>(value: T) {
  const lean = jest.fn().mockResolvedValue(value);
  const select = jest.fn().mockReturnValue({ lean });
  const limit = jest.fn().mockReturnValue({ lean });
  const sort = jest.fn().mockReturnValue({ limit });
  return { lean, select, limit, sort };
}

describe('BranchService', () => {
  it('derives branch role coverage and searchable capabilities from active staff assignments', async () => {
    const branchA = new Types.ObjectId();
    const branchB = new Types.ObjectId();
    const cashierRoleId = new Types.ObjectId();
    const inventoryRoleId = new Types.ObjectId();
    const managerRoleId = new Types.ObjectId();

    const branchRows = [
      {
        _id: branchA,
        code: 'LAG-AGO-01',
        name: 'Ago Palace',
        status: 'active',
        address: {
          line1: '12 Ago Way',
          city: 'Lagos',
          state: 'Lagos',
          geo: { coordinates: [3.35, 6.52] },
        },
        fulfillment: { pickup: true, delivery: true, deliveryZones: [] },
      },
      {
        _id: branchB,
        code: 'LAG-IKE-01',
        name: 'Ikeja',
        status: 'active',
        address: {
          line1: '7 Allen Ave',
          city: 'Lagos',
          state: 'Lagos',
          geo: { coordinates: [3.36, 6.6] },
        },
        fulfillment: { pickup: true, delivery: false, deliveryZones: [] },
      },
    ];
    const staffRows = [
      { branchScope: [branchA.toString()], roleIds: [cashierRoleId] },
      { branchScope: [branchA.toString()], roleIds: [inventoryRoleId] },
      { branchScope: [ALL_BRANCHES], roleIds: [managerRoleId] },
    ];
    const roleRows = [
      {
        _id: cashierRoleId,
        key: 'CASHIER',
        name: 'Cashier',
        permissionKeys: ['pos:sell', 'order:read'],
      },
      {
        _id: inventoryRoleId,
        key: 'INVENTORY_OFFICER',
        name: 'Inventory Officer',
        permissionKeys: ['inventory:read', 'inventory:adjust'],
      },
      {
        _id: managerRoleId,
        key: 'BRANCH_MANAGER',
        name: 'Branch Manager',
        permissionKeys: ['order:read', 'order:transition', 'refund:create'],
      },
    ];

    const branchFind = jest.fn().mockReturnValue(listChain(branchRows));
    const staffFind = jest.fn().mockReturnValue(listChain(staffRows));
    const roleFind = jest.fn().mockReturnValue(listChain(roleRows));
    const service = new BranchService(
      { find: branchFind } as never,
      { find: staffFind } as never,
      { find: roleFind } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.listAdmin({ limit: 10 } as never);

    expect(result.data).toHaveLength(2);

    const ago = result.data.find((branch) => branch.id === branchA.toString());
    const ikeja = result.data.find((branch) => branch.id === branchB.toString());
    expect(ago?.accessSummary?.assignedStaffCount).toBe(3);
    expect(ago?.accessSummary?.roles.map((role) => role.name)).toEqual([
      'Branch Manager',
      'Cashier',
      'Inventory Officer',
    ]);
    expect(ago?.accessSummary?.capabilities.map((capability) => capability.label)).toEqual([
      'Dashboard',
      'Deliveries',
      'Inventory',
      'Orders',
      'Payments & Refunds',
      'Point of Sale',
    ]);

    expect(ikeja?.accessSummary?.assignedStaffCount).toBe(1);
    expect(ikeja?.accessSummary?.roles.map((role) => role.name)).toEqual(['Branch Manager']);
    expect(ikeja?.accessSummary?.capabilities.map((capability) => capability.label)).toEqual([
      'Dashboard',
      'Deliveries',
      'Orders',
      'Payments & Refunds',
    ]);

    expect(staffFind).toHaveBeenCalledWith(
      expect.objectContaining({
        branchScope: { $in: [ALL_BRANCHES, branchA.toString(), branchB.toString()] },
        status: 'active',
      }),
    );
  });

  it('refuses branch deletion while stock remains', async () => {
    const branchId = new Types.ObjectId();
    const service = new BranchService(
      { findById: jest.fn().mockResolvedValue({}) } as never,
      { exists: jest.fn().mockResolvedValue(null) } as never,
      {} as never,
      { exists: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }) } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.softDelete({ sub: 'admin' } as never, branchId.toString())).rejects.toMatchObject<
      Partial<DomainError>
    >({ code: ErrorCode.CONFLICT });
  });

  it('refuses branch deletion while active scoped staff remain', async () => {
    const branchId = new Types.ObjectId();
    const staffExists = jest.fn().mockResolvedValue({ _id: new Types.ObjectId() });
    const service = new BranchService(
      { findById: jest.fn().mockResolvedValue({}) } as never,
      { exists: staffExists } as never,
      {} as never,
      { exists: jest.fn().mockResolvedValue(null) } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.softDelete({ sub: 'admin' } as never, branchId.toString())).rejects.toMatchObject<
      Partial<DomainError>
    >({ code: ErrorCode.CONFLICT });
    expect(staffExists).toHaveBeenCalledWith(
      expect.objectContaining({ branchScope: branchId.toString() }),
    );
  });

  it('marks an empty branch inactive and audits its removal', async () => {
    const branchId = new Types.ObjectId();
    const branch = {
      code: 'LAG-TEST-01',
      name: 'Test branch',
      save: jest.fn().mockResolvedValue(undefined),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new BranchService(
      { findById: jest.fn().mockResolvedValue(branch) } as never,
      { exists: jest.fn().mockResolvedValue(null) } as never,
      {} as never,
      { exists: jest.fn().mockResolvedValue(null) } as never,
      audit as never,
      {} as never,
      {} as never,
    );

    await service.softDelete({ sub: 'admin' } as never, branchId.toString());

    expect(branch.save).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'branch.delete', targetId: branchId.toString() }),
    );
  });
});