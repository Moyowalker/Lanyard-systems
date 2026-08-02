import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import {
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
import { DomainError } from '../../../core/errors/domain-error';
import { cursorFilter, paginate } from '../../../core/pagination/cursor';

@Injectable()
export class BranchService {
  constructor(
    @InjectModel(Branch.name) private readonly branchModel: Model<Branch>,
    @InjectModel(StaffUser.name) private readonly staffModel: Model<StaffUser>,
  ) {}

  /** Public branch locator. With ?near=lat,lng results are sorted by distance. */
  async findPublic(query: BranchLocatorQuery): Promise<BranchSummaryDto[]> {
    const match: FilterQuery<Branch> = { status: BranchStatus.ACTIVE };
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
    const branch = await this.branchModel.findOne({ _id: id, status: BranchStatus.ACTIVE });
    if (!branch) throw new DomainError(ErrorCode.NOT_FOUND, 'Branch not found');
    return branch;
  }

  async listAdmin(
    query: PaginationQuery,
  ): Promise<Paginated<{ id: string } & Record<string, unknown>>> {
    const rows = await this.branchModel
      .find(cursorFilter(query.cursor))
      .sort({ _id: 1 })
      .limit(query.limit + 1)
      .lean();
    const mapped = rows.map((r) => ({ ...r, id: r._id.toString() }));
    return paginate(mapped, query.limit);
  }

  async create(input: CreateBranchInput): Promise<BranchDocument> {
    await this.assertSuperintendent(input.superintendentStaffId);
    try {
      return await this.branchModel.create({
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
}
