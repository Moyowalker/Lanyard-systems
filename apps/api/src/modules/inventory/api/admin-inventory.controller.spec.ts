import 'reflect-metadata';

import { PATH_METADATA } from '@nestjs/common/constants';
import {
  AdjustInventoryInput,
  BranchInventoryItemDto,
  ReceiveInventoryInput,
} from '@lanyard/contracts';

import {
  BRANCH_SCOPE_KEY,
  CurrentUser,
  PERMISSIONS_KEY,
  REALM_KEY,
} from '../../../core/auth/auth.decorators';
import { AdminInventoryController } from './admin-inventory.controller';

describe('AdminInventoryController', () => {
  const inventoryRow: BranchInventoryItemDto = {
    productId: '507f1f77bcf86cd799439011',
    productName: 'Amoxicillin',
    onHand: 12,
    reserved: 2,
    available: 10,
    reorderLevel: 4,
    batchCount: 1,
    isLowStock: false,
  };

  it('declares branch-scoped staff access on the controller', () => {
    expect(Reflect.getMetadata(REALM_KEY, AdminInventoryController)).toBe('staff');
    expect(Reflect.getMetadata(BRANCH_SCOPE_KEY, AdminInventoryController)).toEqual({
      from: 'param',
      key: 'branchId',
    });
  });

  it('binds the expected paths and permissions for each endpoint', () => {
    const cases = [
      { method: 'list', path: '/', permissions: ['inventory:read'] },
      { method: 'lowStock', path: 'low-stock', permissions: ['inventory:read'] },
      { method: 'receive', path: 'receive', permissions: ['inventory:receive'] },
      { method: 'adjust', path: 'adjust', permissions: ['inventory:adjust'] },
    ] as const;

    for (const testCase of cases) {
      const handler = AdminInventoryController.prototype[testCase.method];
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(testCase.path);
      expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual(testCase.permissions);
    }
  });

  it('passes the branch and actor to stock mutations', async () => {
    const inventory = {
      listBranchInventory: jest.fn().mockResolvedValue([inventoryRow]),
      listLowStock: jest.fn().mockResolvedValue([inventoryRow]),
      receive: jest.fn().mockResolvedValue(inventoryRow),
      adjust: jest.fn().mockResolvedValue(inventoryRow),
    };
    const controller = new AdminInventoryController(inventory as never);
    const principal = { sub: '507f1f77bcf86cd799439012' };
    const receiveDto: ReceiveInventoryInput = {
      productId: inventoryRow.productId,
      quantity: 5,
      reason: 'Goods-in',
    };
    const adjustDto: AdjustInventoryInput = {
      productId: inventoryRow.productId,
      quantityDelta: -1,
      reason: 'Cycle count',
    };

    await expect(controller.list('branch-1')).resolves.toEqual({ data: [inventoryRow] });
    await expect(controller.lowStock('branch-1')).resolves.toEqual({ data: [inventoryRow] });
    await expect(controller.receive('branch-1', principal as never, receiveDto)).resolves.toEqual({
      data: inventoryRow,
    });
    await expect(controller.adjust('branch-1', principal as never, adjustDto)).resolves.toEqual({
      data: inventoryRow,
    });

    expect(inventory.receive).toHaveBeenCalledWith('branch-1', principal.sub, receiveDto);
    expect(inventory.adjust).toHaveBeenCalledWith('branch-1', principal.sub, adjustDto);
  });
});
