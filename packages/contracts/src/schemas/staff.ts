import { z } from 'zod';
import { AccountStatus } from '../enums';
import { optionalPhoneSchema } from './phone';

// Staff & access administration (admin console). Staff CRUD requires staff:read/write;
// role CRUD requires role:read/write (super-admin only, per seed).

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'must be a valid id');
/** A branch id, or the literal "ALL" for cross-branch staff. */
const branchScopeEntry = z.union([z.literal('ALL'), objectId]);

export const PharmacistProfileInputSchema = z.object({
  pcnLicenseNo: z.string().trim().min(1).max(40),
  licenseExpiry: z.coerce.date(),
  isSuperintendent: z.boolean().optional().default(false),
});
export type PharmacistProfileInput = z.infer<typeof PharmacistProfileInputSchema>;

export const CreateStaffSchema = z.object({
  email: z.string().email().max(120),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: optionalPhoneSchema,
  password: z.string().min(12).max(200),
  roleIds: z.array(objectId).min(1, 'Assign at least one role'),
  branchScope: z.array(branchScopeEntry).min(1, 'Assign at least one branch (or ALL)'),
  pharmacist: PharmacistProfileInputSchema.optional(),
});
export type CreateStaffInput = z.infer<typeof CreateStaffSchema>;

export const UpdateStaffSchema = z
  .object({
    email: z.string().email().max(120).optional(),
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: z.string().trim().min(1).max(80).optional(),
    phone: optionalPhoneSchema,
    roleIds: z.array(objectId).min(1).optional(),
    branchScope: z.array(branchScopeEntry).min(1).optional(),
    status: z.nativeEnum(AccountStatus).optional(),
    pharmacist: PharmacistProfileInputSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });
export type UpdateStaffInput = z.infer<typeof UpdateStaffSchema>;

export const ResetStaffPasswordSchema = z.object({
  password: z.string().min(12).max(200),
});
export type ResetStaffPasswordInput = z.infer<typeof ResetStaffPasswordSchema>;

export interface StaffRoleRef {
  id: string;
  key: string;
  name: string;
}

export interface StaffDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  status: AccountStatus;
  mfaEnabled: boolean;
  roles: StaffRoleRef[];
  branchScope: string[];
  pharmacist?: { pcnLicenseNo: string; licenseExpiry: string; isSuperintendent: boolean };
  lastLoginAt?: string;
  createdAt: string;
}

export interface StaffListDto {
  data: StaffDto[];
}

/* ── Roles & permissions ── */

export const CreateRoleSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]{1,40}$/, 'key must be UPPER_SNAKE_CASE'),
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(200).optional(),
  permissionKeys: z.array(z.string()).default([]),
});
export type CreateRoleInput = z.infer<typeof CreateRoleSchema>;

export const UpdateRoleSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    description: z.string().trim().max(200).optional(),
    permissionKeys: z.array(z.string()).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });
export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>;

export interface RoleDto {
  id: string;
  key: string;
  name: string;
  description?: string;
  permissionKeys: string[];
  isSystem: boolean;
}

export interface PermissionDto {
  key: string;
  description: string;
  group?: string;
  restricted: boolean;
}

export interface RolesAndPermissionsDto {
  roles: RoleDto[];
  permissions: PermissionDto[];
}
