import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import {
  AccountStatus,
  ALL_BRANCHES,
  ActorType,
  BranchAccessCapabilityDto,
  BranchAccessSummaryDto,
  BranchLocatorQuery,
  BranchStatus,
  BranchSummaryDto,
  CreateBranchInput,
  ErrorCode,
  FulfillmentType,
  Paginated,
  PaginationQuery,
  UpdateBranchInput,
} from '@lanyard/contracts';

import { Branch, BranchDocument } from '../infrastructure/branch.schema';
import { StaffUser } from '../../identity/infrastructure/identity.schemas';
import { Role } from '../../authz/infrastructure/authz.schemas';
import { InventoryItem } from '../../inventory/infrastructure/inventory.schemas';
import { PriceList } from '../../pricing/infrastructure/price-list.schema';
import { AuditService } from '../../../core/platform/audit.service';
import { DomainError } from '../../../core/errors/domain-error';
import { cursorFilter, paginate } from '../../../core/pagination/cursor';
import { TransactionService } from '../../../core/platform/transaction.service';

const BRANCH_CAPABILITY_RULES: Array<{ key: string; label: string; permissions?: string[] }> = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'prescriptions', label: 'Prescriptions', permissions: ['rx:read', 'rx:verify'] },
  { key: 'orders', label: 'Orders', permissions: ['order:read'] },
  { key: 'deliveries', label: 'Deliveries', permissions: ['order:transition'] },
  {
    key: 'payments-refunds',
    label: 'Payments & Refunds',
    permissions: ['refund:create', 'pos:refund'],
  },
  { key: 'inventory', label: 'Inventory', permissions: ['inventory:read', 'inventory:adjust'] },
  { key: 'point-of-sale', label: 'Point of Sale', permissions: ['pos:sell'] },
  { key: 'reports', label: 'Reports', permissions: ['report:read'] },
  { key: 'staff-access', label: 'Staff & Access', permissions: ['staff:read', 'role:read'] },
];

type BranchListRow = Branch & { _id: Types.ObjectId };
type StaffScopeRow = {
  branchScope?: string[];
  roleIds?: Types.ObjectId[];
  status?: string;
  deletedAt?: Date;
};
type RoleSummaryRow = { _id: Types.ObjectId; key: string; name: string; permissionKeys?: string[] };

@Injectable()
export class BranchService {
  constructor(
    @InjectModel(Branch.name) private readonly branchModel: Model<Branch>,
    @InjectModel(StaffUser.name) private readonly staffModel: Model<StaffUser>,
    @InjectModel(Role.name) private readonly roleModel: Model<Role>,
    @InjectModel(InventoryItem.name) private readonly inventoryModel: Model<InventoryItem>,
    @InjectModel(PriceList.name) private readonly priceModel: Model<PriceList>,
    private readonly audit: AuditService,
    private readonly tx: TransactionService,
  ) {}

  /** Public branch locator. With ?near=lat,lng results are sorted by distance. */
  async findPublic(query: BranchLocatorQuery): Promise<BranchSummaryDto[]> {
    const match: FilterQuery<Branch> = { status: BranchStatus.ACTIVE, deletedAt: { $exists: false } };
    if (query.service === FulfillmentType.PICKUP) match['fulfillment.pickup'] = true;
    if (query.service === FulfillmentType.DELIVERY) match['fulfillment.delivery'] = true;

    if (query.near) {
      const [lat, lng] = query.near.split(',').map(Number);
      const rows = await this.branchModel.aggregate<BranchDocument & { distanceM: number }>([
        {
          $geoNear: {
            near: { type: 'Point', coordinates: [lng, lat] },
            distanceField: 'distanceM',
            spherical: true,
            query: match,
          },
        },
        { $limit: 25 },
      ]);
      return rows.map((b) => this.toSummary(b, b.distanceM));
    }

    const rows = await this.branchModel.find(match).limit(50).lean();
    return rows.map((b) => this.toSummary(b as unknown as BranchDocument));
  }

  async getPublic(id: string): Promise<BranchDocument> {
    const branch = await this.branchModel.findOne({
      _id: id,
      status: BranchStatus.ACTIVE,
      deletedAt: { $exists: false },
    });
    if (!branch) throw new DomainError(ErrorCode.NOT_FOUND, 'Branch not found');
    return branch;
  }

  async listAdmin(
    query: PaginationQuery,
  ): Promise<Paginated<BranchSummaryDto>> {
    const rows = await this.branchModel
      .find({ ...cursorFilter(query.cursor), deletedAt: { $exists: false } })
      .sort({ _id: 1 })
      .limit(query.limit + 1)
      .lean();
    const mapped = rows.map((r) => this.toAdminSummary(r as BranchListRow));
    await this.attachAccessSummaries(mapped);
    return paginate(mapped, query.limit);
  }

  /** Branch metadata available to the caller for selecting an operational context. */
  async listAvailable(
    query: PaginationQuery,
    branchScope: string[],
  ): Promise<Paginated<BranchSummaryDto>> {
    const filter: FilterQuery<Branch> = { ...cursorFilter(query.cursor), deletedAt: { $exists: false } };
    if (!branchScope.includes(ALL_BRANCHES)) {
      filter._id = { $in: branchScope.map((id) => new Types.ObjectId(id)) };
    }
    const rows = await this.branchModel
      .find(filter)
      .sort({ _id: 1 })
      .limit(query.limit + 1)
      .lean();
    return paginate(
      rows.map((row) => this.toSummary(row as unknown as BranchDocument)),
      query.limit,
    );
  }

  async create(input: CreateBranchInput): Promise<BranchDocument> {
    await this.assertSuperintendent(input.superintendentStaffId);
    try {
      return await this.tx.run(async (session) => {
        if (input.sourceBranchId) {
          const source = await this.branchModel
            .findOne({ _id: input.sourceBranchId, deletedAt: { $exists: false } })
            .session(session);
          if (!source) throw new DomainError(ErrorCode.NOT_FOUND, 'Source branch not found');
        }
        const [branch] = await this.branchModel.create([{
          code: input.code,
          name: input.name,
          status: input.status,
          address: {
            line1: input.address.line1,
            line2: input.address.line2,
            city: input.address.city,
            state: input.address.state,
            country: input.address.country,
            geo: { type: 'Point', coordinates: [input.address.lng, input.address.lat] },
          },
          contact: input.contact ?? {},
          license: {
            pcnPremisesNo: input.pcnPremisesNo,
            superintendentStaffId: new Types.ObjectId(input.superintendentStaffId),
          },
          hours: input.hours,
          fulfillment: input.fulfillment ?? { pickup: true, delivery: false, deliveryZones: [] },
        }], { session });
        if (input.sourceBranchId) {
          const sourcePrices = await this.priceModel
            .find({ branchId: new Types.ObjectId(input.sourceBranchId) })
            .session(session)
            .lean();
          if (sourcePrices.length > 0) {
            await this.priceModel.insertMany(
              sourcePrices.map(({ productId, priceKobo, costKobo, compareAtKobo, currency, isAvailable }) => ({
                branchId: branch._id,
                productId,
                priceKobo,
                costKobo,
                compareAtKobo,
                currency,
                isAvailable,
              })),
              { session },
            );
          }
        }
        return branch;
      });
    } catch (err) {
      if (this.isDuplicateKey(err)) {
        throw new DomainError(ErrorCode.CONFLICT, `Branch code "${input.code}" already exists`);
      }
      throw err;
    }
  }

  async update(id: string, input: UpdateBranchInput): Promise<BranchDocument> {
    if (input.superintendentStaffId) await this.assertSuperintendent(input.superintendentStaffId);

    const update: Record<string, unknown> = {};
    if (input.name !== undefined) update.name = input.name;
    if (input.status !== undefined) update.status = input.status;
    if (input.hours !== undefined) update.hours = input.hours;
    if (input.fulfillment !== undefined) update.fulfillment = input.fulfillment;
    if (input.contact !== undefined) update.contact = input.contact;
    if (input.address !== undefined) {
      update.address = {
        line1: input.address.line1,
        line2: input.address.line2,
        city: input.address.city,
        state: input.address.state,
        country: input.address.country,
        geo: { type: 'Point', coordinates: [input.address.lng, input.address.lat] },
      };
    }
    if (input.pcnPremisesNo || input.superintendentStaffId) {
      update.license = {
        ...(input.pcnPremisesNo ? { pcnPremisesNo: input.pcnPremisesNo } : {}),
        ...(input.superintendentStaffId
          ? { superintendentStaffId: new Types.ObjectId(input.superintendentStaffId) }
          : {}),
      };
    }

    const branch = await this.branchModel.findByIdAndUpdate(id, { $set: update }, { new: true });
    if (!branch) throw new DomainError(ErrorCode.NOT_FOUND, 'Branch not found');
    return branch;
  }

  async softDelete(principal: import('../../../core/auth/principal').AuthPrincipal, id: string): Promise<void> {
    const branch = await this.branchModel.findById(id);
    if (!branch || branch.deletedAt) throw new DomainError(ErrorCode.NOT_FOUND, 'Branch not found');

    const branchId = new Types.ObjectId(id);
    const [stock, activeStaff] = await Promise.all([
      this.inventoryModel.exists({ branchId, onHand: { $gt: 0 } }),
      this.staffModel.exists({
        deletedAt: { $exists: false },
        status: AccountStatus.ACTIVE,
        branchScope: id,
      }),
    ]);
    if (stock) {
      throw new DomainError(ErrorCode.CONFLICT, 'Cannot delete a branch that still has inventory stock');
    }
    if (activeStaff) {
      throw new DomainError(ErrorCode.CONFLICT, 'Reassign or remove active staff before deleting this branch');
    }

    branch.deletedAt = new Date();
    branch.status = BranchStatus.INACTIVE;
    await branch.save();
    await this.audit.record({
      actorId: principal.sub,
      actorType: ActorType.STAFF,
      action: 'branch.delete',
      targetType: 'branch',
      targetId: id,
      metadata: { code: branch.code, name: branch.name },
    });
  }

  /**
   * The superintendent must be a real, live staff member. It is NOT required to be a licensed
   * pharmacist: that gate was removed at the client's explicit request so branches could be
   * created before PCN licences are on file.
   *
   * Worth knowing if this is ever revisited — PCN rules expect a premises superintendent to be
   * a registered pharmacist, so the console surfaces each candidate's licence status at the
   * point of selection to keep it a visible, deliberate choice rather than a silent one.
   */
  private async assertSuperintendent(staffId: string): Promise<void> {
    const staff = await this.staffModel.findById(staffId).lean();
    if (!staff || staff.deletedAt) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        'superintendentStaffId must reference an existing staff member',
        [{ field: 'superintendentStaffId', issue: 'staff member not found' }],
      );
    }
  }

  private isDuplicateKey(err: unknown): boolean {
    return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
  }

  private async attachAccessSummaries(branches: BranchSummaryDto[]): Promise<void> {
    if (branches.length === 0) return;

    const branchIds = branches.map((branch) => branch.id);
    const staff = await this.staffModel
      .find({
        deletedAt: { $exists: false },
        status: AccountStatus.ACTIVE,
        branchScope: { $in: [ALL_BRANCHES, ...branchIds] },
      })
      .select('branchScope roleIds')
      .lean<StaffScopeRow[]>();

    if (staff.length === 0) return;

    const roleIds = [...new Set(staff.flatMap((row) => (row.roleIds ?? []).map((id) => id.toString())))];
    const roles = roleIds.length
      ? await this.roleModel
          .find({ _id: { $in: roleIds.map((id) => new Types.ObjectId(id)) } })
          .select('key name permissionKeys')
          .lean<RoleSummaryRow[]>()
      : [];
    const roleMap = new Map(roles.map((role) => [role._id.toString(), role]));
    const byBranch = new Map(branches.map((branch) => [branch.id, this.emptyAccessSummary()]));

    for (const staffRow of staff) {
      const scope = (staffRow.branchScope ?? []).map(String);
      const targetBranchIds = scope.includes(ALL_BRANCHES)
        ? branchIds
        : scope.filter((branchId) => byBranch.has(branchId));
      if (targetBranchIds.length === 0) continue;

      const rolesForStaff = (staffRow.roleIds ?? [])
        .map((id) => roleMap.get(id.toString()))
        .filter((role): role is RoleSummaryRow => Boolean(role));

      for (const branchId of targetBranchIds) {
        const summary = byBranch.get(branchId);
        if (!summary) continue;
        summary.assignedStaffCount += 1;
        for (const role of rolesForStaff) {
          const existing = summary.roles.find(
            (entry: BranchAccessSummaryDto['roles'][number]) => entry.key === role.key,
          );
          if (existing) {
            existing.staffCount += 1;
          } else {
            summary.roles.push({ key: role.key, name: role.name, staffCount: 1 });
          }
          for (const capability of this.capabilitiesFor(role.permissionKeys ?? [], true)) {
            if (
              !summary.capabilities.some(
                (entry: BranchAccessSummaryDto['capabilities'][number]) =>
                  entry.key === capability.key,
              )
            ) {
              summary.capabilities.push(capability);
            }
          }
        }
      }
    }

    for (const branch of branches) {
      const summary = byBranch.get(branch.id);
      if (!summary || summary.assignedStaffCount === 0) continue;
      summary.roles.sort(
        (a: BranchAccessSummaryDto['roles'][number], b: BranchAccessSummaryDto['roles'][number]) =>
          a.name.localeCompare(b.name),
      );
      summary.capabilities.sort(
        (
          a: BranchAccessSummaryDto['capabilities'][number],
          b: BranchAccessSummaryDto['capabilities'][number],
        ) => a.label.localeCompare(b.label),
      );
      branch.accessSummary = summary;
    }
  }

  private emptyAccessSummary(): BranchAccessSummaryDto {
    return { assignedStaffCount: 0, roles: [], capabilities: [] };
  }

  private capabilitiesFor(
    permissions: string[],
    hasStaffAssignment: boolean,
  ): BranchAccessCapabilityDto[] {
    return BRANCH_CAPABILITY_RULES.filter((rule) => {
      if (!rule.permissions) return hasStaffAssignment;
      return rule.permissions.some((permission) => permissions.includes(permission));
    }).map((rule) => ({ key: rule.key, label: rule.label }));
  }

  private toSummary(b: BranchDocument, distanceM?: number): BranchSummaryDto {
    const [lng, lat] = b.address.geo.coordinates;
    return {
      id: b._id.toString(),
      code: b.code,
      name: b.name,
      status: b.status,
      address: { line1: b.address.line1, city: b.address.city, state: b.address.state, lat, lng },
      fulfillment: {
        pickup: b.fulfillment?.pickup ?? false,
        delivery: b.fulfillment?.delivery ?? false,
        deliveryZones: b.fulfillment?.deliveryZones?.map((zone) => ({
          name: zone.name,
          feeKobo: zone.feeKobo,
          etaMins: zone.etaMins,
          radiusKm: zone.radiusKm,
        })),
      },
      ...(distanceM !== undefined ? { distanceKm: Math.round(distanceM / 100) / 10 } : {}),
    };
  }

  private toAdminSummary(b: BranchListRow): BranchSummaryDto {
    const coordinates = b.address?.geo?.coordinates ?? [0, 0];
    const [lng, lat] = coordinates;
    return {
      id: b._id.toString(),
      code: b.code,
      name: b.name,
      status: b.status,
      address: {
        line1: b.address.line1,
        line2: b.address.line2,
        city: b.address.city,
        state: b.address.state,
        country: b.address.country,
        lat,
        lng,
        geo: { coordinates: [lng, lat] },
      },
      contact: {
        phone: b.contact?.phone,
        email: b.contact?.email,
      },
      license: {
        pcnPremisesNo: b.license?.pcnPremisesNo,
        superintendentStaffId: b.license?.superintendentStaffId?.toString(),
      },
      fulfillment: {
        pickup: b.fulfillment?.pickup ?? false,
        delivery: b.fulfillment?.delivery ?? false,
        deliveryZones: b.fulfillment?.deliveryZones?.map((zone) => ({
          name: zone.name,
          feeKobo: zone.feeKobo,
          etaMins: zone.etaMins,
          radiusKm: zone.radiusKm,
        })),
      },
    };
  }
}
