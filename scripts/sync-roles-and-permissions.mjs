/**
 * Reference-data migration: brings a database seeded before the POS/Vendor modules landed up
 * to what the code expects — the 4 missing permissions AND the 2 missing roles.
 *
 * Symptoms it fixes:
 *   - "Point of Sale" and "Vendors" missing from the admin sidebar, and the POS/VENDORS groups
 *     absent from Roles & permissions entirely.
 *   - Only 5 roles listed (Administrator, Branch Manager, Pharmacist, Super Admin, Support) —
 *     Cashier and Inventory Officer never existed, so no staff member could be assigned either.
 *
 * The nav is permission-driven (visibleNav in apps/web-admin/src/lib/roles.ts), and
 * RoleAdminService.assertPermissionsExist refuses to grant a key with no permission document —
 * so this cannot be fixed from the UI. Nor can the roles: the Roles page has no create action,
 * its create endpoint needs `role:write` (unticked on Administrator), and createRole() hard-codes
 * isSystem:false, whereas these two are system roles.
 *
 * Why not just run the seeder: (1) it is excluded from the Nest build and needs ts-node plus
 * src/, neither of which exist in the pruned production image; (2) past the permissions step it
 * creates a superintendent with the well-known dev password, a test customer, and demo
 * branch/products/stock — none of which belong in production.
 *
 * This script is deliberately narrow and ADDITIVE: it upserts permission documents, creates
 * only genuinely missing roles, and $addToSet's grants onto existing roles. It never removes a
 * permission or overwrites an existing role's permission set, so hand-made edits (for example
 * role:write deliberately unticked on Administrator) are preserved.
 *
 * Usage — reports what it WOULD do and changes nothing:
 *   MONGODB_URI="mongodb+srv://..." node scripts/sync-roles-and-permissions.mjs
 * Apply for real:
 *   MONGODB_URI="mongodb+srv://..." node scripts/sync-roles-and-permissions.mjs --apply
 *
 * Safe to run more than once.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// mongoose ships as a production dependency of the API workspace.
const mongoose = require(path.join(repoRoot, 'apps/api/node_modules/mongoose'));

const APPLY = process.argv.includes('--apply');
const URI = process.env.MONGODB_URI;

if (!URI) {
  console.error('MONGODB_URI is not set. Pass the production connection string.');
  process.exit(1);
}

/** Mirrors the PERMISSIONS entries in apps/api/src/database/seed.ts. */
const PERMISSIONS = [
  { key: 'pos:sell', description: 'Ring up counter (POS) sales', group: 'pos' },
  { key: 'pos:refund', description: 'Return/refund counter (POS) sales', group: 'pos' },
  { key: 'vendor:read', description: 'View vendors', group: 'vendors' },
  { key: 'vendor:write', description: 'Manage vendors', group: 'vendors' },
];

/**
 * Roles the code defines that a pre-POS database never had. Permission sets mirror the ROLES
 * array in apps/api/src/database/seed.ts exactly. Created with isSystem:true because these are
 * built-in roles, which the admin API cannot express (createRole hard-codes isSystem:false).
 */
const MISSING_ROLES = [
  {
    key: 'CASHIER',
    name: 'Cashier',
    permissionKeys: ['pos:sell', 'catalog:read', 'pricing:read', 'order:read'],
  },
  {
    key: 'INVENTORY_OFFICER',
    name: 'Inventory Officer',
    permissionKeys: [
      'catalog:read',
      'catalog:write',
      'pricing:read',
      'pricing:write',
      'inventory:read',
      'inventory:adjust',
      'inventory:receive',
      'vendor:read',
      'vendor:write',
    ],
  },
];

/** Mirrors the ROLES grants in the seeder. ADMIN/SUPER_ADMIN receive every key. */
const GRANTS = {
  SUPER_ADMIN: ['pos:sell', 'pos:refund', 'vendor:read', 'vendor:write'],
  ADMIN: ['pos:sell', 'pos:refund', 'vendor:read', 'vendor:write'],
  BRANCH_MANAGER: ['pos:sell', 'pos:refund', 'vendor:read', 'vendor:write'],
  INVENTORY_OFFICER: ['vendor:read', 'vendor:write'],
  PHARMACIST: ['pos:sell'],
  CASHIER: ['pos:sell'],
  SUPPORT: ['pos:sell'],
};

const run = async () => {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  console.log(`Connected to database: ${db.databaseName}`);
  console.log(APPLY ? '\nMODE: APPLY (writing changes)\n' : '\nMODE: DRY RUN (no changes)\n');

  const permissions = db.collection('permissions');
  const roles = db.collection('roles');

  const existingCount = await permissions.countDocuments();
  console.log(`Permissions currently in database: ${existingCount}`);

  // 1. Permission documents
  for (const p of PERMISSIONS) {
    const found = await permissions.findOne({ key: p.key });
    if (found) {
      console.log(`  = ${p.key} already present`);
      continue;
    }
    console.log(`  + ${p.key} (${p.group}) — ${p.description}`);
    if (APPLY) {
      await permissions.updateOne(
        { key: p.key },
        { $set: { ...p, restricted: false } },
        { upsert: true },
      );
    }
  }

  // 2. Missing roles — create only; an existing role is never overwritten.
  console.log('\nRoles:');
  const existingRoleCount = await roles.countDocuments();
  console.log(`  (${existingRoleCount} roles currently in database)`);
  for (const role of MISSING_ROLES) {
    const found = await roles.findOne({ key: role.key });
    if (found) {
      console.log(`  = ${role.key} already exists — left untouched`);
      continue;
    }
    console.log(`  + ${role.key} "${role.name}" with ${role.permissionKeys.length} permissions`);
    if (APPLY) {
      await roles.insertOne({
        key: role.key,
        name: role.name,
        permissionKeys: role.permissionKeys,
        isSystem: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  // 3. Role grants — additive only.
  console.log('\nRole grants:');
  for (const [roleKey, keys] of Object.entries(GRANTS)) {
    const role = await roles.findOne({ key: roleKey });
    if (!role) {
      // In a dry run the roles above have not actually been inserted yet, so this is expected.
      const pending = MISSING_ROLES.some((r) => r.key === roleKey);
      console.log(
        pending && !APPLY
          ? `  ~ ${roleKey} will be created above with its grants`
          : `  ! ${roleKey} not found — skipped`,
      );
      continue;
    }
    const current = role.permissionKeys ?? [];
    const missing = keys.filter((k) => !current.includes(k));
    if (missing.length === 0) {
      console.log(`  = ${roleKey} already has all (${current.length} permissions)`);
      continue;
    }
    console.log(
      `  + ${roleKey}: ${missing.join(', ')}  (${current.length} → ${current.length + missing.length})`,
    );
    if (APPLY) {
      await roles.updateOne(
        { key: roleKey },
        { $addToSet: { permissionKeys: { $each: missing } } },
      );
    }
  }

  if (APPLY) {
    console.log(
      `\nDone. Permissions now: ${await permissions.countDocuments()}, roles: ${await roles.countDocuments()}`,
    );
    console.log('Staff must sign out and back in — permissions are baked into the JWT at login.');
  } else {
    console.log('\nDry run only. Re-run with --apply to write these changes.');
  }

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error('Migration failed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
