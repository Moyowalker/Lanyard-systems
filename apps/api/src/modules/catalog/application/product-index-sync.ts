import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { Product } from '../infrastructure/catalog.schemas';

/**
 * Keeps the `product_text` weighted text index in sync with the schema definition,
 * even in production where `autoIndex` is OFF. MongoDB permits only ONE text index
 * per collection and cannot alter an existing one — so if the index's fields/weights
 * change, a plain `createIndexes()` silently fails with `IndexOptionsConflict` and the
 * `$text` query then THROWS at runtime (surfacing as a 500 / empty POS + search).
 *
 * On boot: read the existing indexes; if `product_text` is missing OR its weights no
 * longer match the schema, drop the stale one (when present) and recreate all schema
 * indexes. Best-effort — failures are logged, never fatal to boot.
 */
@Injectable()
export class ProductIndexSync implements OnModuleInit {
  private readonly logger = new Logger(ProductIndexSync.name);

  /** Must mirror the `weights` on the `product_text` index in catalog.schemas.ts. */
  private static readonly DESIRED_WEIGHTS: Record<string, number> = {
    name: 10,
    genericName: 6,
    brand: 4,
    searchTokens: 2,
    packSize: 2,
    description: 1,
  };

  constructor(@InjectModel(Product.name) private readonly productModel: Model<Product>) {}

  async onModuleInit(): Promise<void> {
    try {
      const collection = this.productModel.collection;
      const indexes = (await collection.indexes()) as Array<{
        name?: string;
        weights?: Record<string, number>;
      }>;
      const existing = indexes.find((index) => index.name === 'product_text');

      if (existing && this.weightsMatch(existing.weights ?? {})) {
        this.logger.log('product_text index is up to date');
        return;
      }

      if (existing) {
        await collection.dropIndex('product_text');
        this.logger.log('Dropped stale product_text index for recreation');
      }

      await this.productModel.createIndexes();
      this.logger.log('product_text index ensured');
    } catch (err) {
      this.logger.error(
        `ProductIndexSync failed (search may degrade to substring): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private weightsMatch(actual: Record<string, number>): boolean {
    const desired = ProductIndexSync.DESIRED_WEIGHTS;
    const desiredKeys = Object.keys(desired);
    const actualKeys = Object.keys(actual);
    if (desiredKeys.length !== actualKeys.length) return false;
    return desiredKeys.every((key) => actual[key] === desired[key]);
  }
}
