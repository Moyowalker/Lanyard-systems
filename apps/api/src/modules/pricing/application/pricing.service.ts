import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Currency, UpsertPriceInput } from '@lanyard/contracts';

import { PriceList } from '../infrastructure/price-list.schema';

export interface PriceEntry {
  priceKobo: number;
  compareAtKobo?: number;
  currency: string;
  isAvailable: boolean;
}

/** Owns per-branch pricing. Other modules read prices through this service. */
@Injectable()
export class PricingService {
  constructor(@InjectModel(PriceList.name) private readonly priceModel: Model<PriceList>) {}

  /** Price entries for a set of products at one branch, keyed by productId string. */
  async getPriceMap(branchId: string, productIds: string[]): Promise<Map<string, PriceEntry>> {
    if (productIds.length === 0) return new Map();
    const rows = await this.priceModel
      .find({
        branchId: new Types.ObjectId(branchId),
        productId: { $in: productIds.map((id) => new Types.ObjectId(id)) },
      })
      .lean();
    const map = new Map<string, PriceEntry>();
    for (const r of rows) {
      map.set(r.productId.toString(), {
        priceKobo: r.priceKobo,
        compareAtKobo: r.compareAtKobo,
        currency: r.currency,
        isAvailable: r.isAvailable,
      });
    }
    return map;
  }

  async getBranchPrices(branchId: string): Promise<PriceList[]> {
    return this.priceModel.find({ branchId: new Types.ObjectId(branchId) }).lean();
  }

  async upsertPrice(branchId: string, input: UpsertPriceInput): Promise<void> {
    await this.priceModel.updateOne(
      { branchId: new Types.ObjectId(branchId), productId: new Types.ObjectId(input.productId) },
      {
        $set: {
          priceKobo: input.priceKobo,
          compareAtKobo: input.compareAtKobo,
          isAvailable: input.isAvailable,
          currency: Currency.NGN,
        },
      },
      { upsert: true },
    );
  }
}
