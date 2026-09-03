import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import { Currency, UpsertPriceInput } from '@lanyard/contracts';

import { PriceList } from '../infrastructure/price-list.schema';

export interface PriceEntry {
  priceKobo: number;
  costKobo?: number;
  compareAtKobo?: number;
  currency: string;
  isAvailable: boolean;
}

export interface PriceChange {
  before?: PriceEntry;
  after: PriceEntry;
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
        costKobo: r.costKobo,
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

  /** Product IDs with a branch price, optionally including prices hidden from the storefront. */
  async getPricedProductIds(branchId: string, includeHidden = false): Promise<Types.ObjectId[]> {
    const filter: Record<string, unknown> = { branchId: new Types.ObjectId(branchId) };
    if (!includeHidden) filter.isAvailable = true;

    const rows = await this.priceModel.find(filter, { productId: 1 }).lean();
    return rows.map((row) => row.productId);
  }

  async upsertPrice(
    branchId: string,
    input: UpsertPriceInput,
    session?: ClientSession,
  ): Promise<PriceChange> {
    const filter = {
      branchId: new Types.ObjectId(branchId),
      productId: new Types.ObjectId(input.productId),
    };
    const previous = await this.priceModel.findOne(filter).session(session ?? null).lean();
    const after: PriceEntry = {
      priceKobo: input.priceKobo,
      costKobo: input.costKobo,
      compareAtKobo: input.compareAtKobo,
      isAvailable: input.isAvailable,
      currency: Currency.NGN,
    };
    await this.priceModel.updateOne(
      filter,
      {
        $set: {
          ...after,
        },
      },
      { upsert: true, session },
    );
    return {
      before: previous
        ? {
            priceKobo: previous.priceKobo,
            costKobo: previous.costKobo,
            compareAtKobo: previous.compareAtKobo,
            currency: previous.currency,
            isAvailable: previous.isAvailable,
          }
        : undefined,
      after,
    };
  }
}
