import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ActorType,
  CreateRoleInput,
  ErrorCode,
  PermissionDto,
  RoleDto,
  RoleKey,
  RolesAndPermissionsDto,
  UpdateRoleInput,
} from '@lanyard/contracts';

import { Permission, Role } from '../infrastructure/authz.schemas';
import { AuditService } from '../../../core/platform/audit.service';
import { AuthPrincipal } from '../../../core/auth/principal';
import { DomainError } from '../../../core/errors/domain-error';

@Injectable()
export class RoleAdminService {
  constructor(
    @InjectModel(Role.name) private readonly roleModel: Model<Role>,
    @InjectModel(Permission.name) private readonly permissionModel: Model<Permission>,
    private readonly audit: AuditService,
  ) {}

  async listAll(): Promise<RolesAndPermissionsDto> {
    const [roles, permissions] = await Promise.all([
      this.roleModel.find().sort({ isSystem: -1, name: 1 }).lean(),
      this.permissionModel.find().sort({ group: 1, key: 1 }).lean(),
    ]);
    return {
      roles: roles.map((r) => this.toRoleDto(r)),
      permissions: permissions.map((p) => this.toPermissionDto(p)),
    };
  }

  async createRole(principal: AuthPrincipal, input: CreateRoleInput): Promise<RoleDto> {
    await this.assertPermissionsExist(input.permissionKeys);
    try {
      const role = await this.roleModel.create({
        key: input.key,
        name: input.name,
        description: input.description,
        permissionKeys: [...new Set(input.permissionKeys)],
        isSystem: false,
      });
      await this.audit.record({
        actorId: principal.sub,
        actorType: ActorType.STAFF,
        action: 'role.create',
        targetType: 'role',
        targetId: role._id.toString(),
        metadata: { key: role.key, permissions: role.permissionKeys.length },
      });
      return this.toRoleDto(role.toObject());
    } catch (err) {
      if (this.isDuplicateKey(err)) {
        throw new DomainError(ErrorCode.CONFLICT, `A role with key "${input.key}" already exists`);
      }
      throw err;
    }
  }

  async updateRole(principal: AuthPrincipal, id: string, input: UpdateRoleInput): Promise<RoleDto> {
    const role = await this.roleModel.findById(id);
    if (!role) throw new DomainError(ErrorCode.NOT_FOUND, 'Role not found');

    // The Super Admin role is the platform's root of trust — it must stay all-powerful.
    if (role.key === RoleKey.SUPER_ADMIN) {
      throw new DomainError(ErrorCode.FORBIDDEN, 'The Super Admin role cannot be modified');
    }

    if (input.permissionKeys) {
      await this.assertPermissionsExist(input.permissionKeys);
      role.permissionKeys = [...new Set(input.permissionKeys)];
    }
    if (input.name !== undefined) role.name = input.name;
    if (input.description !== undefined) role.description = input.description;

    await role.save();
    await this.audit.record({
      actorId: principal.sub,
      actorType: ActorType.STAFF,
      action: 'role.update',
      targetType: 'role',
      targetId: id,
      metadata: { key: role.key, fields: Object.keys(input) },
    });
    return this.toRoleDto(role.toObject());
  }

  private async assertPermissionsExist(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const found = await this.permissionModel
      .find({ key: { $in: keys } })
      .select('key')
      .lean();
    const known = new Set(found.map((p) => p.key));
    const unknown = keys.filter((k) => !known.has(k));
    if (unknown.length > 0) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, `Unknown permission(s): ${unknown.join(', ')}`);
    }
  }

  private toRoleDto(r: Role & { _id: { toString(): string } }): RoleDto {
    return {
      id: r._id.toString(),
      key: r.key,
      name: r.name,
      description: r.description,
      permissionKeys: r.permissionKeys ?? [],
      isSystem: r.isSystem,
    };
  }

  private toPermissionDto(p: Permission): PermissionDto {
    return { key: p.key, description: p.description, group: p.group, restricted: p.restricted };
  }

  private isDuplicateKey(err: unknown): boolean {
    return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
  }
}
