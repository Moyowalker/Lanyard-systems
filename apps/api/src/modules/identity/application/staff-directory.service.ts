import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { AccountStatus } from '@lanyard/contracts';

import { StaffUser } from '../infrastructure/identity.schemas';

export interface StaffLookupQuery {
  q: string;
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

  async lookupPharmacists(query: StaffLookupQuery): Promise<StaffLookupResult[]> {
    const trimmed = query.q.trim();
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

    const rows = await this.staffModel
      .find({
        status: AccountStatus.ACTIVE,
        deletedAt: { $exists: false },
        pharmacist: { $exists: true },
        $or: search,
      })
      .sort({ 'pharmacist.isSuperintendent': -1, firstName: 1, lastName: 1 })
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