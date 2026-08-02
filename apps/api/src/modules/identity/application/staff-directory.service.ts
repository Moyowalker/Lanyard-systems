import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { AccountStatus } from '@lanyard/contracts';

import { StaffUser } from '../infrastructure/identity.schemas';

export interface StaffLookupQuery {
  /** Omitted → return the first `limit` active staff so a picker can populate on open. */
  q?: string;
  limit: number;
}

export interface StaffLookupResult {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  pcnLicenseNo?: string;
  isSuperintendent: boolean;
}

@Injectable()
export class StaffDirectoryService {
  constructor(@InjectModel(StaffUser.name) private readonly staffModel: Model<StaffUser>) {}

  /**
   * Staff picker for branch assignment. Returns ALL active staff, not just those holding a
   * PCN licence — the previous `pharmacist: { $exists: true }` filter made the list
   * unconditionally empty, because nothing in the console could set a pharmacist profile.
   * Licence details are still returned so the caller can show who is licensed; the choice
   * of superintendent is the admin's.
   */
  async lookupStaff(query: StaffLookupQuery): Promise<StaffLookupResult[]> {
    const trimmed = query.q?.trim() ?? '';

    const filter: FilterQuery<StaffUser> = {
      status: AccountStatus.ACTIVE,
      deletedAt: { $exists: false },
    };

    if (trimmed.length > 0) {
      const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');

      const search: FilterQuery<StaffUser>[] = [
        { firstName: regex },
        { lastName: regex },
        { email: regex },
        { phone: regex },
        { 'pharmacist.pcnLicenseNo': regex },
      ];

      if (Types.ObjectId.isValid(trimmed)) {
        search.unshift({ _id: new Types.ObjectId(trimmed) });
      }
      filter.$or = search;
    }

    const rows = await this.staffModel
      .find(filter)
      // Licensed pharmacists (superintendents first) surface at the top; everyone else follows.
      .sort({
        'pharmacist.isSuperintendent': -1,
        'pharmacist.pcnLicenseNo': -1,
        firstName: 1,
        lastName: 1,
      })
      .limit(query.limit)
      .lean();

    return rows.map((row) => ({
      id: row._id.toString(),
      fullName: [row.firstName, row.lastName].filter(Boolean).join(' '),
      email: row.email,
      phone: row.phone,
      pcnLicenseNo: row.pharmacist?.pcnLicenseNo,
      isSuperintendent: row.pharmacist?.isSuperintendent ?? false,
    }));
  }
}
