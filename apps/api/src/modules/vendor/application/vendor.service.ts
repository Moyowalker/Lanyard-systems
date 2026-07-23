import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import {
  CreateVendorInput,
  ErrorCode,
  Paginated,
  UpdateVendorInput,
  VendorDto,
  VendorQuery,
} from '@lanyard/contracts';

import { Vendor, VendorDocument } from '../infrastructure/vendor.schema';
import { DomainError } from '../../../core/errors/domain-error';
import { cursorFilter, paginate } from '../../../core/pagination/cursor';

@Injectable()
export class VendorService {
  constructor(@InjectModel(Vendor.name) private readonly vendorModel: Model<Vendor>) {}

  async listAdmin(query: VendorQuery): Promise<Paginated<VendorDto>> {
    const filter: FilterQuery<Vendor> = {
      deletedAt: { $exists: false },
      ...cursorFilter(query.cursor),
    };
    if (query.q) {
      const rx = new RegExp(query.q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.name = rx;
    }
    const rows = await this.vendorModel
      .find(filter)
      .sort({ _id: 1 })
      .limit(query.limit + 1)
      .lean();
    return paginate(
      rows.map((r) => this.toDto(r)),
      query.limit,
    );
  }

  async create(input: CreateVendorInput): Promise<VendorDto> {
    try {
      const vendor = await this.vendorModel.create({
        name: input.name,
        contactName: input.contactName,
        phone: input.phone,
        email: input.email,
        address: input.address,
        note: input.note,
        isActive: input.isActive,
      });
      return this.toDto(vendor.toObject());
    } catch (err) {
      if (this.isDuplicateKey(err)) {
        throw new DomainError(ErrorCode.CONFLICT, `Vendor "${input.name}" already exists`);
      }
      throw err;
    }
  }

  async update(id: string, input: UpdateVendorInput): Promise<VendorDto> {
    const update: Record<string, unknown> = {};
    for (const key of [
      'name',
      'contactName',
      'phone',
      'email',
      'address',
      'note',
      'isActive',
    ] as const) {
      if (input[key] !== undefined) update[key] = input[key];
    }
    let vendor: VendorDocument | null;
    try {
      vendor = await this.vendorModel.findByIdAndUpdate(id, { $set: update }, { new: true });
    } catch (err) {
      if (this.isDuplicateKey(err)) {
        throw new DomainError(ErrorCode.CONFLICT, `Vendor "${input.name}" already exists`);
      }
      throw err;
    }
    if (!vendor) throw new DomainError(ErrorCode.NOT_FOUND, 'Vendor not found');
    return this.toDto(vendor.toObject());
  }

  private isDuplicateKey(err: unknown): boolean {
    return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
  }

  private toDto(row: {
    _id: Types.ObjectId;
    name: string;
    contactName?: string;
    phone?: string;
    email?: string;
    address?: string;
    note?: string;
    isActive?: boolean;
    createdAt?: Date;
  }): VendorDto {
    return {
      id: row._id.toString(),
      name: row.name,
      contactName: row.contactName,
      phone: row.phone,
      email: row.email,
      address: row.address,
      note: row.note,
      isActive: row.isActive ?? true,
      createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    };
  }
}
