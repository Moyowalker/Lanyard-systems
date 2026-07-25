import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import request from 'supertest';
import {
  AccountStatus,
  BranchStatus,
  ProductForm,
  ProductStatus,
  RegulatoryClass,
  RoleKey,
} from '@lanyard/contracts';

import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/core/errors/all-exceptions.filter';
import { PasswordService } from '../src/core/security/password.service';
import { Customer, StaffUser } from '../src/modules/identity/infrastructure/identity.schemas';
import { Permission, Role } from '../src/modules/authz/infrastructure/authz.schemas';
import { Branch } from '../src/modules/branch/infrastructure/branch.schema';
import { Category, Product } from '../src/modules/catalog/infrastructure/catalog.schemas';
import { PriceList } from '../src/modules/pricing/infrastructure/price-list.schema';
import { InventoryItem } from '../src/modules/inventory/infrastructure/inventory.schemas';
import { StorageService } from '../src/core/storage/storage.service';
import { EmailChannel } from '../src/modules/notification/application/channels/email.channel';

/**
 * In-memory storage stub. The real S3/MinIO transport is verified separately (Phase 3b);
 * here we exercise the Rx workflow without the AWS SDK (its dynamic import is incompatible
 * with Jest's VM). The AV scanner still reads the buffer we "stored".
 */
const blobStore = new Map<string, Buffer>();
const fakeStorage = {
  putObject: async (key: string, buf: Buffer) => {
    blobStore.set(key, Buffer.from(buf));
  },
  getObjectBuffer: async (key: string) => blobStore.get(key) ?? Buffer.alloc(0),
  getSignedDownloadUrl: async (key: string) => `https://test.local/${key}`,
  signedUrlTtl: 300,
};
const fakeEmailChannel = {
  send: async () => ({ providerRef: 'integration-test-email' }),
};

const PHONE = '+2348090000001';
const STAFF_EMAIL = 'pharma@test.local';
const STAFF_PW = 'Passw0rd!Test';

describe('Lanyard API integration flows', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let ids: { branch: string; otc: string; pom: string };
  let customerToken: string;
  let staffToken: string;

  const model = <T>(name: string) => app.get<Model<T>>(getModelToken(name));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(StorageService)
      .useValue(fakeStorage)
      .overrideProvider(EmailChannel)
      .useValue(fakeEmailChannel)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    http = request(app.getHttpServer());

    // Clean the isolated test DB collections we touch.
    const names = [
      Customer.name,
      StaffUser.name,
      Role.name,
      Permission.name,
      Branch.name,
      Category.name,
      Product.name,
      PriceList.name,
      InventoryItem.name,
    ];
    for (const n of names) await model(n).deleteMany({});

    // Seed RBAC.
    const allPerms = [
      'order:read',
      'order:transition',
      'refund:create',
      'rx:read',
      'rx:verify',
      'phi:view',
    ];
    await model<Permission>(Permission.name).create(
      allPerms.map((key) => ({ key, description: key, group: 'test' })),
    );
    const [pharmRole] = await model<Role>(Role.name).create([
      { key: RoleKey.PHARMACIST, name: 'Pharmacist', permissionKeys: allPerms, isSystem: true },
    ]);

    // Seed a staff pharmacist (valid in-date PCN license) + a customer.
    const passwordHash = await app.get(PasswordService).hash(STAFF_PW);
    const staff = await model<StaffUser>(StaffUser.name).create({
      email: STAFF_EMAIL,
      firstName: 'Pharma',
      lastName: 'Test',
      passwordHash,
      mfaEnabled: false,
      roleIds: [pharmRole._id],
      branchScope: ['ALL'],
      pharmacist: {
        pcnLicenseNo: 'PCN-T-1',
        licenseExpiry: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
        isSuperintendent: true,
      },
      status: AccountStatus.ACTIVE,
    });

    const branch = await model<Branch>(Branch.name).create({
      code: 'TST-01',
      name: 'Test Branch',
      status: BranchStatus.ACTIVE,
      address: {
        line1: '1 Test St',
        city: 'Lagos',
        state: 'Lagos',
        country: 'NG',
        geo: { type: 'Point', coordinates: [3.3, 6.5] },
      },
      license: { pcnPremisesNo: 'PREM-T-1', superintendentStaffId: staff._id },
      fulfillment: { pickup: true, delivery: false, deliveryZones: [] },
    });

    const cat = await model<Category>(Category.name).create({
      slug: 'test-cat',
      name: 'Test',
      path: [],
    });
    const mkProduct = (slug: string, name: string, cls: RegulatoryClass) =>
      model<Product>(Product.name).create({
        slug,
        name,
        form: ProductForm.TABLET,
        categoryIds: [cat._id],
        regulatoryClass: cls,
        requiresPrescription: cls !== RegulatoryClass.OTC,
        isControlled: cls === RegulatoryClass.CONTROLLED,
        status: ProductStatus.PUBLISHED,
      });
    const otc = await mkProduct('t-otc', 'Test OTC', RegulatoryClass.OTC);
    const pom = await mkProduct('t-pom', 'Test POM', RegulatoryClass.POM);

    for (const p of [otc, pom]) {
      await model<PriceList>(PriceList.name).create({
        branchId: branch._id,
        productId: p._id,
        priceKobo: 50000,
        isAvailable: true,
      });
      await model<InventoryItem>(InventoryItem.name).create({
        branchId: branch._id,
        productId: p._id,
        onHand: 50,
        reserved: 0,
      });
    }

    await model<Customer>(Customer.name).create({
      phone: PHONE,
      firstName: 'Test',
      lastName: 'Buyer',
      email: 'buyer@test.local',
      phoneVerified: true,
      status: AccountStatus.ACTIVE,
    });

    ids = { branch: branch._id.toString(), otc: otc._id.toString(), pom: pom._id.toString() };

    // Acquire tokens via the real auth endpoints.
    const otp = await http
      .post('/auth/customer/otp/request')
      .send({ phone: PHONE, purpose: 'login' });
    const verify = await http
      .post('/auth/customer/otp/verify')
      .send({ phone: PHONE, code: otp.body.devCode, purpose: 'login' });
    customerToken = verify.body.accessToken;
    const login = await http
      .post('/auth/staff/login')
      .send({ email: STAFF_EMAIL, password: STAFF_PW });
    staffToken = login.body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
  });

  const asCustomer = (m: 'get' | 'post' | 'delete', path: string) =>
    http[m](path).set('authorization', `Bearer ${customerToken}`);
  const asStaff = (m: 'get' | 'post', path: string) =>
    http[m](path).set('authorization', `Bearer ${staffToken}`);

  it('issues tokens for customer (OTP) and staff (password)', () => {
    expect(typeof customerToken).toBe('string');
    expect(typeof staffToken).toBe('string');
  });

  it('rejects unauthenticated access to /me', async () => {
    await http.get('/me').expect(401);
  });

  it('settles an OTC order: pay → PAID + stock reserved, and is idempotent', async () => {
    await asCustomer('post', '/cart/items')
      .send({ branchId: ids.branch, productId: ids.otc, quantity: 2 })
      .expect(201);
    const order = await asCustomer('post', '/orders').send({ fulfillment: { type: 'pickup' } });
    expect(order.body.status).toBe('AWAITING_PAYMENT');
    const orderId = order.body.id;

    const intent = await asCustomer('post', '/payments/intents').send({ orderId });
    const intentId = intent.body.intentId;

    await http.post(`/payments/dev/confirm/${intentId}`).expect(200);
    const paid = await asCustomer('get', `/orders/${orderId}`);
    expect(paid.body.status).toBe('PAID');
    expect(paid.body.payment.status).toBe('paid');

    const invAfter = await model<InventoryItem>(InventoryItem.name)
      .findOne({ branchId: new Types.ObjectId(ids.branch), productId: new Types.ObjectId(ids.otc) })
      .lean();
    expect(invAfter?.reserved).toBe(2);
    expect(invAfter?.onHand).toBe(50);

    // Idempotent replay — no double reservation.
    await http.post(`/payments/dev/confirm/${intentId}`).expect(200);
    const invReplay = await model<InventoryItem>(InventoryItem.name)
      .findOne({ branchId: new Types.ObjectId(ids.branch), productId: new Types.ObjectId(ids.otc) })
      .lean();
    expect(invReplay?.reserved).toBe(2);
  });

  it('blocks a POM order without a prescription, then gates and advances it after verify', async () => {
    await asCustomer('post', '/cart/items')
      .send({ branchId: ids.branch, productId: ids.pom, quantity: 1 })
      .expect(201);

    // No prescription → rejected.
    await asCustomer('post', '/orders')
      .send({ fulfillment: { type: 'pickup' } })
      .expect(400);

    // Upload a (clean) prescription, wait for the async AV scan, then create the order.
    const upload = await asCustomer('post', '/prescriptions')
      .field('branchId', ids.branch)
      .attach('files', Buffer.from('clean rx'), { filename: 'rx.jpg', contentType: 'image/jpeg' });
    if (upload.status !== 201) {
      throw new Error(`upload failed: ${upload.status} ${JSON.stringify(upload.body)}`);
    }
    const rxId = upload.body.id;
    expect(rxId).toBeTruthy();

    await waitFor(async () => {
      const rx = await asCustomer('get', `/prescriptions/${rxId}`);
      return rx.body.files[0].avScan === 'clean';
    });

    const order = await asCustomer('post', '/orders').send({
      fulfillment: { type: 'pickup' },
      prescriptionIds: [rxId],
    });
    expect(order.body.status).toBe('AWAITING_RX_VERIFICATION');

    // Pharmacist verifies → order advances to AWAITING_PAYMENT.
    await asStaff('post', `/admin/prescriptions/${rxId}/verify`)
      .send({ decision: 'verified' })
      .expect(201);
    const advanced = await asCustomer('get', `/orders/${order.body.id}`);
    expect(advanced.body.status).toBe('AWAITING_PAYMENT');
  });
});

async function waitFor(check: () => Promise<boolean>, attempts = 25, delayMs = 400): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error('waitFor: condition not met in time');
}
