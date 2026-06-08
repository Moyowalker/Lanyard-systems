import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { RoleKey } from '@lanyard/contracts';
import { baseSchemaOptions } from '../../../database/schema.helpers';

/* ════════════════════════════════════════════════════════════════════════
 * permissions — seeded, append-mostly catalog of fine-grained capabilities.
 * Permission keys use `resource:action`, e.g. "rx:verify", "refund:create".
 * ════════════════════════════════════════════════════════════════════════ */

export type PermissionDocument = HydratedDocument<Permission>;

@Schema({ ...baseSchemaOptions, collection: 'permissions' })
export class Permission {
  @Prop({ required: true, unique: true, trim: true })
  key: string; // e.g. "order:transition"

  @Prop({ required: true, trim: true })
  description: string;

  /** Logical grouping for admin UI, e.g. "orders", "inventory", "phi". */
  @Prop({ type: String, trim: true, index: true })
  group?: string;

  /** Permissions that may only be granted to qualified staff (e.g. rx:verify → pharmacist). */
  @Prop({ type: Boolean, default: false })
  restricted: boolean;
}

export const PermissionSchema = SchemaFactory.createForClass(Permission);
// `key` uniqueness is declared inline on the @Prop above.

/* ════════════════════════════════════════════════════════════════════════
 * roles — bundles of permission keys. Data-driven so new roles need no code.
 * ════════════════════════════════════════════════════════════════════════ */

export type RoleDocument = HydratedDocument<Role>;

@Schema({ ...baseSchemaOptions, collection: 'roles' })
export class Role {
  /** Stable key; system roles use RoleKey, custom roles may add their own. */
  @Prop({ required: true, unique: true, trim: true })
  key: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, trim: true })
  description?: string;

  /** Flat list of permission keys this role grants (see Permission.key). */
  @Prop({ type: [String], default: [] })
  permissionKeys: string[];

  /** System roles are protected from deletion/edit of their key. */
  @Prop({ type: Boolean, default: false })
  isSystem: boolean;
}

export const RoleSchema = SchemaFactory.createForClass(Role);
RoleSchema.index({ permissionKeys: 1 });

/** Convenience: the set of system role keys this schema expects to be seeded. */
export const SYSTEM_ROLE_KEYS = Object.values(RoleKey);
