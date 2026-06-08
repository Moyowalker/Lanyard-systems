/* eslint-disable no-console */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { hash } from '@node-rs/argon2';

import {
  AccountStatus,
  BranchStatus,
  ProductForm,
  ProductStatus,
  RegulatoryClass,
  RoleKey,
} from '@lanyard/contracts';

import { AppModule } from '../app.module';
import { Customer } from '../modules/identity/infrastructure/identity.schemas';
import { StaffUser } from '../modules/identity/infrastructure/identity.schemas';
import { Permission, Role } from '../modules/authz/infrastructure/authz.schemas';
import { Branch } from '../modules/branch/infrastructure/branch.schema';
import { Category, Product } from '../modules/catalog/infrastructure/catalog.schemas';
import { PriceList } from '../modules/pricing/infrastructure/price-list.schema';
import { InventoryItem } from '../modules/inventory/infrastructure/inventory.schemas';

/**
 * Idempotent reference-data seeder. Safe to run repeatedly.
 *   pnpm --filter @lanyard/api seed
 * Requires the dev Mongo replica set running (docker compose ... up -d).
 */

const PERMISSIONS: Array<{
  key: string;
  description: string;
  group: string;
  restricted?: boolean;
}> = [
  { key: 'catalog:read', description: 'View products & categories', group: 'catalog' },
  { key: 'catalog:write', description: 'Manage products & categories', group: 'catalog' },
  { key: 'pricing:read', description: 'View per-branch pricing', group: 'pricing' },
  { key: 'pricing:write', description: 'Set per-branch pricing', group: 'pricing' },
  { key: 'inventory:read', description: 'View inventory', group: 'inventory' },
  { key: 'inventory:adjust', description: 'Adjust stock levels', group: 'inventory' },
  { key: 'inventory:receive', description: 'Receive stock', group: 'inventory' },
  { key: 'order:read', description: 'View orders', group: 'orders' },
  { key: 'order:transition', description: 'Move orders through fulfillment', group: 'orders' },
  { key: 'order:cancel', description: 'Cancel orders', group: 'orders' },
  { key: 'refund:create', description: 'Issue refunds', group: 'payments' },
  { key: 'rx:read', description: 'View prescriptions', group: 'prescriptions' },
  {
    key: 'rx:verify',
    description: 'Verify/reject prescriptions',
    group: 'prescriptions',
    restricted: true,
  },
  {
    key: 'phi:view',
    description: 'View prescription images (PHI)',
    group: 'phi',
    restricted: true,
  },
  { key: 'customer:read', description: 'View customers', group: 'customers' },
  { key: 'customer:write', description: 'Manage customers', group: 'customers' },
  { key: 'staff:read', description: 'View staff', group: 'staff' },
  { key: 'staff:write', description: 'Manage staff', group: 'staff' },
  { key: 'branch:read', description: 'View branches', group: 'branches' },
  { key: 'branch:write', description: 'Manage branches', group: 'branches' },
  { key: 'role:read', description: 'View roles', group: 'roles' },
  { key: 'role:write', description: 'Manage roles', group: 'roles' },
  { key: 'report:read', description: 'View reports', group: 'insight' },
  { key: 'audit:read', description: 'View audit log', group: 'insight' },
];

const allKeys = PERMISSIONS.map((p) => p.key);

const ROLES: Array<{ key: RoleKey; name: string; permissionKeys: string[] }> = [
  {
    key: RoleKey.SUPPORT,
    name: 'Support',
    permissionKeys: ['order:read', 'customer:read', 'rx:read'],
  },
  {
    key: RoleKey.PHARMACIST,
    name: 'Pharmacist',
    permissionKeys: [
      'rx:read',
      'rx:verify',
      'phi:view',
      'order:read',
      'order:transition',
      'inventory:read',
    ],
  },
  {
    key: RoleKey.BRANCH_MANAGER,
    name: 'Branch Manager',
    permissionKeys: [
      'catalog:read',
      'pricing:read',
      'pricing:write',
      'inventory:read',
      'inventory:adjust',
      'inventory:receive',
      'order:read',
      'order:transition',
      'order:cancel',
      'refund:create',
      'customer:read',
      'report:read',
    ],
  },
  {
    key: RoleKey.ADMIN,
    name: 'Administrator',
    permissionKeys: allKeys.filter((k) => k !== 'role:write'),
  },
  { key: RoleKey.SUPER_ADMIN, name: 'Super Admin', permissionKeys: allKeys },
];

async function run(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });

  const permissionModel = app.get<Model<Permission>>(getModelToken(Permission.name));
  const roleModel = app.get<Model<Role>>(getModelToken(Role.name));
  const staffModel = app.get<Model<StaffUser>>(getModelToken(StaffUser.name));
  const branchModel = app.get<Model<Branch>>(getModelToken(Branch.name));
  const categoryModel = app.get<Model<Category>>(getModelToken(Category.name));
  const productModel = app.get<Model<Product>>(getModelToken(Product.name));
  const priceModel = app.get<Model<PriceList>>(getModelToken(PriceList.name));
  const inventoryModel = app.get<Model<InventoryItem>>(getModelToken(InventoryItem.name));
  const customerModel = app.get<Model<Customer>>(getModelToken(Customer.name));

  // 1. Permissions
  for (const p of PERMISSIONS) {
    await permissionModel.updateOne(
      { key: p.key },
      { $set: { description: p.description, group: p.group, restricted: !!p.restricted } },
      { upsert: true },
    );
  }
  console.log(`✔ permissions: ${PERMISSIONS.length}`);

  // 2. Roles
  for (const r of ROLES) {
    await roleModel.updateOne(
      { key: r.key },
      { $set: { name: r.name, permissionKeys: r.permissionKeys, isSystem: true } },
      { upsert: true },
    );
  }
  console.log(`✔ roles: ${ROLES.length}`);

  const pharmacistRole = await roleModel.findOne({ key: RoleKey.PHARMACIST }).lean();
  const adminRole = await roleModel.findOne({ key: RoleKey.ADMIN }).lean();

  // 3. Superintendent pharmacist (staff) — dev password: "Passw0rd!"
  const passwordHash = await hash('Passw0rd!');
  const superintendent = await staffModel.findOneAndUpdate(
    { email: 'superintendent@lanyard.test' },
    {
      $set: {
        firstName: 'Ada',
        lastName: 'Okeke',
        passwordHash,
        mfaEnabled: false,
        roleIds: [pharmacistRole?._id, adminRole?._id].filter(Boolean) as Types.ObjectId[],
        branchScope: ['ALL'],
        pharmacist: {
          pcnLicenseNo: 'PCN-SEED-0001',
          licenseExpiry: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
          isSuperintendent: true,
        },
        status: AccountStatus.ACTIVE,
      },
    },
    { upsert: true, new: true },
  );
  console.log(`✔ superintendent staff: ${superintendent?.email}`);

  // 4. Branch (active — backed by the superintendent above)
  const branch = await branchModel.findOneAndUpdate(
    { code: 'LAG-IKEJA-01' },
    {
      $set: {
        name: 'Lanyard Pharmacy — Ikeja',
        status: BranchStatus.ACTIVE,
        address: {
          line1: '12 Allen Avenue',
          city: 'Ikeja',
          state: 'Lagos',
          country: 'NG',
          geo: { type: 'Point', coordinates: [3.3515, 6.6018] }, // [lng, lat]
        },
        contact: { phone: '+2348000000001', email: 'ikeja@lanyard.test' },
        license: { pcnPremisesNo: 'PCN-PREM-0001', superintendentStaffId: superintendent!._id },
        hours: [
          { day: 1, open: '08:00', close: '21:00' },
          { day: 2, open: '08:00', close: '21:00' },
        ],
        fulfillment: {
          pickup: true,
          delivery: true,
          deliveryZones: [{ name: 'Ikeja GRA', radiusKm: 5, feeKobo: 150000, etaMins: 60 }],
        },
      },
    },
    { upsert: true, new: true },
  );
  console.log(`✔ branch: ${branch?.code}`);

  // 4b. Branch manager scoped to Ikeja ONLY (proves branch-scope denial) — pwd "Passw0rd!"
  const managerRole = await roleModel.findOne({ key: RoleKey.BRANCH_MANAGER }).lean();
  await staffModel.findOneAndUpdate(
    { email: 'manager.ikeja@lanyard.test' },
    {
      $set: {
        firstName: 'Tunde',
        lastName: 'Bello',
        passwordHash,
        mfaEnabled: false,
        roleIds: [managerRole?._id].filter(Boolean) as Types.ObjectId[],
        branchScope: [branch!._id.toString()], // scoped to Ikeja, NOT 'ALL'
        status: AccountStatus.ACTIVE,
      },
    },
    { upsert: true, new: true },
  );
  console.log('✔ branch manager (Ikeja-scoped): manager.ikeja@lanyard.test');

  // 5. Categories
  const otcCat = await categoryModel.findOneAndUpdate(
    { slug: 'pain-relief' },
    { $set: { name: 'Pain Relief', path: [], isActive: true } },
    { upsert: true, new: true },
  );
  const rxCat = await categoryModel.findOneAndUpdate(
    { slug: 'antibiotics' },
    { $set: { name: 'Antibiotics', path: [], isActive: true } },
    { upsert: true, new: true },
  );
  console.log('✔ categories: 2');

  // 6. Products — one OTC, one POM (prescription-required)
  const paracetamol = await productModel.findOneAndUpdate(
    { slug: 'paracetamol-500mg' },
    {
      $set: {
        name: 'Paracetamol 500mg',
        genericName: 'Paracetamol',
        form: ProductForm.TABLET,
        strength: '500mg',
        packSize: '10 tablets',
        categoryIds: [otcCat!._id],
        regulatoryClass: RegulatoryClass.OTC,
        requiresPrescription: false,
        isControlled: false,
        nafdacRegNo: 'A4-SEED-001',
        status: ProductStatus.PUBLISHED,
      },
    },
    { upsert: true, new: true },
  );

  const amoxicillin = await productModel.findOneAndUpdate(
    { slug: 'amoxicillin-500mg' },
    {
      $set: {
        name: 'Amoxicillin 500mg',
        genericName: 'Amoxicillin',
        form: ProductForm.CAPSULE,
        strength: '500mg',
        packSize: '21 capsules',
        categoryIds: [rxCat!._id],
        regulatoryClass: RegulatoryClass.POM,
        requiresPrescription: true,
        isControlled: false,
        nafdacRegNo: 'A4-SEED-002',
        status: ProductStatus.PUBLISHED,
      },
    },
    { upsert: true, new: true },
  );
  console.log('✔ products: 2 (1 OTC, 1 POM)');

  // 7. Per-branch pricing + 8. inventory
  for (const product of [paracetamol!, amoxicillin!]) {
    await priceModel.updateOne(
      { branchId: branch!._id, productId: product._id },
      {
        $set: {
          priceKobo: product.slug === 'paracetamol-500mg' ? 80000 : 350000,
          isAvailable: true,
        },
      },
      { upsert: true },
    );
    await inventoryModel.updateOne(
      { branchId: branch!._id, productId: product._id },
      { $set: { onHand: 100, reserved: 0, reorderLevel: 20 } },
      { upsert: true },
    );
  }
  console.log('✔ price lists + inventory for branch');

  // 9. Test customer
  await customerModel.updateOne(
    { phone: '+2348012345678' },
    {
      $set: {
        firstName: 'Test',
        lastName: 'Customer',
        email: 'customer@lanyard.test',
        phoneVerified: true,
        defaultBranchId: branch!._id,
        status: AccountStatus.ACTIVE,
        consent: { phiProcessing: true, marketing: false, version: '2026-01', at: new Date() },
      },
    },
    { upsert: true },
  );
  console.log('✔ test customer: +2348012345678');

  console.log('\nSeed complete.');
  await app.close();
}

run().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
