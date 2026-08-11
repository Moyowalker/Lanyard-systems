import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  AccountStatus,
  ActorType,
  CreateStaffInput,
  ErrorCode,
  PrincipalType,
  RoleKey,
  StaffDto,
  StaffListDto,
  StaffRoleRef,
  UpdateStaffInput,
} from '@lanyard/contracts';

import { Session, StaffUser, StaffUserDocument } from '../infrastructure/identity.schemas';
import { Role } from '../../authz/infrastructure/authz.schemas';
import { PasswordService } from '../../../core/security/password.service';
import { AuditService } from '../../../core/platform/audit.service';
import { AuthPrincipal } from '../../../core/auth/principal';
import { DomainError } from '../../../core/errors/domain-error';

@Injectable()
export class StaffAdminService {
  constructor(
    @InjectModel(StaffUser.name) private readonly staffModel: Model<StaffUser>,
    @InjectModel(Session.name) private readonly sessionModel: Model<Session>,
    @InjectModel(Role.name) private readonly roleModel: Model<Role>,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<StaffListDto> {
    const staff = await this.staffModel
      .find({ deletedAt: { $exists: false } })
      .sort({ createdAt: -1 })
      .lean();
    const roleMap = await this.roleMapFor(staff.flatMap((s) => s.roleIds ?? []));
    return { data: staff.map((s) => this.toDto(s, roleMap)) };
  }

  async get(id: string): Promise<StaffDto> {
    const staff = await this.staffModel.findById(id).lean();
    if (!staff || staff.deletedAt) throw new DomainError(ErrorCode.NOT_FOUND, 'Staff not found');
    const roleMap = await this.roleMapFor(staff.roleIds ?? []);
    return this.toDto(staff, roleMap);
  }

  async create(principal: AuthPrincipal, input: CreateStaffInput): Promise<StaffDto> {
    const roles = await this.resolveRoles(input.roleIds);
    this.assertCanGrantRoles(principal, roles);

    const passwordHash = await this.passwords.hash(input.password);
    try {
      const created = await this.staffModel.create({
        email: input.email.toLowerCase().trim(),
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        passwordHash,
        passwordChangedAt: new Date(),
        mfaEnabled: false,
        roleIds: roles.map((r) => r._id),
        branchScope: input.branchScope,
        pharmacist: input.pharmacist,
        status: AccountStatus.ACTIVE,
      });

      await this.audit.record({
        actorId: principal.sub,
        actorType: ActorType.STAFF,
        action: 'staff.create',
        targetType: 'staff',
        targetId: created._id.toString(),
        metadata: { email: created.email, roles: roles.map((r) => r.key) },
      });
      return this.get(created._id.toString());
    } catch (err) {
      if (this.isDuplicateKey(err)) {
        throw new DomainError(ErrorCode.CONFLICT, 'A staff account with this email already exists');
      }
      throw err;
    }
  }

  async update(principal: AuthPrincipal, id: string, input: UpdateStaffInput): Promise<StaffDto> {
    const staff = await this.staffModel.findById(id);
    if (!staff || staff.deletedAt) throw new DomainError(ErrorCode.NOT_FOUND, 'Staff not found');

    if (input.roleIds) {
      const roles = await this.resolveRoles(input.roleIds);
      this.assertCanGrantRoles(principal, roles);
      staff.roleIds = roles.map((r) => r._id);
    }
    if (input.status !== undefined) {
      // Guard against locking yourself out of the console.
      if (id === principal.sub && input.status !== AccountStatus.ACTIVE) {
        throw new DomainError(ErrorCode.FORBIDDEN, 'You cannot suspend your own account');
      }
      staff.status = input.status;
    }
    if (input.firstName !== undefined) staff.firstName = input.firstName;
    if (input.lastName !== undefined) staff.lastName = input.lastName;
    if (input.email !== undefined) staff.email = input.email.toLowerCase().trim();
    if (input.phone !== undefined) staff.phone = input.phone;
    if (input.branchScope !== undefined) staff.branchScope = input.branchScope;
    if (input.pharmacist !== undefined) staff.pharmacist = input.pharmacist;

    try {
      await staff.save();
    } catch (err) {
      if (this.isDuplicateKey(err)) {
        throw new DomainError(ErrorCode.CONFLICT, 'A staff account with this email already exists');
      }
      throw err;
    }
    await this.audit.record({
      actorId: principal.sub,
      actorType: ActorType.STAFF,
      action: 'staff.update',
      targetType: 'staff',
      targetId: id,
      metadata: { fields: Object.keys(input) },
    });
    return this.get(id);
  }

  async softDelete(principal: AuthPrincipal, id: string): Promise<void> {
    if (id === principal.sub) {
      throw new DomainError(ErrorCode.FORBIDDEN, 'You cannot delete your own account');
    }
    const staff = await this.staffModel.findById(id);
    if (!staff || staff.deletedAt) throw new DomainError(ErrorCode.NOT_FOUND, 'Staff not found');

    const now = new Date();
    staff.deletedAt = now;
    staff.status = AccountStatus.SUSPENDED;
    await staff.save();
    await this.sessionModel.updateMany(
      {
        principalId: staff._id,
        principalType: PrincipalType.STAFF,
        revokedAt: { $exists: false },
      },
      { $set: { revokedAt: now } },
    );
    await this.audit.record({
      actorId: principal.sub,
      actorType: ActorType.STAFF,
      action: 'staff.delete',
      targetType: 'staff',
      targetId: id,
      metadata: { email: staff.email },
    });
  }

  async resetPassword(principal: AuthPrincipal, id: string, password: string): Promise<void> {
    const staff = await this.staffModel.findById(id);
    if (!staff || staff.deletedAt) throw new DomainError(ErrorCode.NOT_FOUND, 'Staff not found');
    staff.passwordHash = await this.passwords.hash(password);
    staff.passwordChangedAt = new Date();
    await staff.save();
    await this.audit.record({
      actorId: principal.sub,
      actorType: ActorType.STAFF,
      action: 'staff.reset_password',
      targetType: 'staff',
      targetId: id,
    });
  }

  /* ── helpers ── */

  private async resolveRoles(
    roleIds: string[],
  ): Promise<Array<{ _id: Types.ObjectId; key: string; name: string }>> {
    const ids = roleIds.map((id) => new Types.ObjectId(id));
    const roles = await this.roleModel
      .find({ _id: { $in: ids } })
      .select('key name')
      .lean();
    if (roles.length !== new Set(roleIds).size) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'One or more roles do not exist');
    }
    return roles.map((r) => ({ _id: r._id, key: r.key, name: r.name }));
  }

  /** Only a super-admin may grant the SUPER_ADMIN role (prevents privilege escalation). */
  private assertCanGrantRoles(principal: AuthPrincipal, roles: Array<{ key: string }>): void {
    const grantsSuperAdmin = roles.some((r) => r.key === RoleKey.SUPER_ADMIN);
    if (grantsSuperAdmin && !principal.roles.includes(RoleKey.SUPER_ADMIN)) {
      throw new DomainError(
        ErrorCode.FORBIDDEN,
        'Only a super admin can grant the Super Admin role',
      );
    }
  }

  private async roleMapFor(roleIds: Types.ObjectId[]): Promise<Map<string, StaffRoleRef>> {
    const unique = [...new Set(roleIds.map((id) => id.toString()))];
    if (unique.length === 0) return new Map();
    const roles = await this.roleModel
      .find({ _id: { $in: unique.map((id) => new Types.ObjectId(id)) } })
      .select('key name')
      .lean();
    return new Map(
      roles.map((r) => [r._id.toString(), { id: r._id.toString(), key: r.key, name: r.name }]),
    );
  }

  private toDto(
    s: StaffUserDocument | (StaffUser & { _id: Types.ObjectId; createdAt?: Date }),
    roleMap: Map<string, StaffRoleRef>,
  ): StaffDto {
    const doc = s as StaffUser & {
      _id: Types.ObjectId;
      createdAt?: Date;
      lastLoginAt?: Date;
    };
    return {
      id: doc._id.toString(),
      email: doc.email,
      firstName: doc.firstName,
      lastName: doc.lastName,
      phone: doc.phone,
      status: doc.status,
      mfaEnabled: doc.mfaEnabled,
      roles: (doc.roleIds ?? [])
        .map((rid) => roleMap.get(rid.toString()))
        .filter((r): r is StaffRoleRef => Boolean(r)),
      branchScope: (doc.branchScope ?? []).map(String),
      pharmacist: doc.pharmacist
        ? {
            pcnLicenseNo: doc.pharmacist.pcnLicenseNo,
            licenseExpiry: new Date(doc.pharmacist.licenseExpiry).toISOString(),
            isSuperintendent: doc.pharmacist.isSuperintendent,
          }
        : undefined,
      lastLoginAt: doc.lastLoginAt ? new Date(doc.lastLoginAt).toISOString() : undefined,
      createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date(0).toISOString(),
    };
  }

  private isDuplicateKey(err: unknown): boolean {
    return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
  }
}
