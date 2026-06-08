import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  ProductDetailQuery,
  ProductDetailQuerySchema,
  ProductListQuery,
  ProductListQuerySchema,
  ProductSearchQuery,
  ProductSearchQuerySchema,
} from '@lanyard/contracts';

import { Public } from '../../../core/auth/auth.decorators';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe';
import { CatalogService } from '../application/catalog.service';

/** Public storefront catalog. Per-branch price/availability fold in when ?branchId= given. */
@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Public()
  @Get('categories')
  async listCategories() {
    return { data: await this.catalog.listCategories() };
  }

  @Public()
  @Get('products')
  listProducts(@Query(new ZodValidationPipe(ProductListQuerySchema)) query: ProductListQuery) {
    return this.catalog.listProducts(query);
  }

  @Public()
  @Get('search')
  search(@Query(new ZodValidationPipe(ProductSearchQuerySchema)) query: ProductSearchQuery) {
    return this.catalog.search(query);
  }

  @Public()
  @Get('products/:slug')
  getProduct(
    @Param('slug') slug: string,
    @Query(new ZodValidationPipe(ProductDetailQuerySchema)) query: ProductDetailQuery,
  ) {
    return this.catalog.getProduct(slug, query);
  }
}
