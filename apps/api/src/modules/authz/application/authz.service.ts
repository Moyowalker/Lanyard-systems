import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ALL_BRANCHES } from '@lanyard/contracts';

import { Role } from '../infrastructure/authz.schemas';

export interface ResolvedAccess {
  roleKeys: string[];
  permissions: string[];
}

/**
 * Resolves a staff member's effective access: their role keys and the union of
 * permission keys those roles grant. Called at token-issue time so the access
 * token carries permissions (re-validated server-side for high-risk actions).
 */
@Injectable()
export class AuthzService {
  constructor(@InjectModel(Role.name) private readonly roleModel: Model<Role>) {}

  async resolveForRoles(roleIds: Types.ObjectId[]): Promise<ResolvedAccess> {
    if (!roleIds || roleIds.length === 0) return { roleKeys: [], permissions: [] };

    const roles = await this.roleModel
      .find({ _id: { $in: roleIds } })
      .select('key permissionKeys')
      .lean();

    const roleKeys = roles.map((r) => r.key);
    const permissions = [...new Set(roles.flatMap((r) => r.permissionKeys ?? []))];
    return { roleKeys, permissions };
  }

  /** Whether a branch scope grants access to a specific branch. */
  hasBranchAccess(branchScope: string[], branchId: string): boolean {
    return branchScope.includes(ALL_BRANCHES) || branchScope.includes(branchId);
  }
}
