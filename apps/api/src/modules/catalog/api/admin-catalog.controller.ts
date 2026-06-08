import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CreateCategoryInput,
  CreateCategorySchema,
  CreateProductInput,
  CreateProductSchema,
  ProductListQuery,
  ProductListQuerySchema,
  UpdateProductInput,
  UpdateProductSchema,
} from '@lanyard/contracts';

import { RequirePermissions, RequireRealm } from '../../../core/auth/auth.decorators';
import { PermissionsGuard, RealmGuard } from '../../../core/auth/authz.guards';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe';
import { CatalogService } from '../application/catalog.service';

/** Catalog administration. Products/categories are GLOBAL → not branch-scoped. */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/catalog')
@UseGuards(RealmGuard, PermissionsGuard)
@RequireRealm('staff')
export class AdminCatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('products')
  @RequirePermissions('catalog:read')
  listProducts(@Query(new ZodValidationPipe(ProductListQuerySchema)) query: ProductListQuery) {
    return this.catalog.listProductsAdmin(query);
  }

  @Post('products')
  @RequirePermissions('catalog:write')
  createProduct(@Body(new ZodValidationPipe(CreateProductSchema)) dto: CreateProductInput) {
    return this.catalog.createProduct(dto);
  }

  @Patch('products/:id')
  @RequirePermissions('catalog:write')
  updateProduct(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateProductSchema)) dto: UpdateProductInput,
  ) {
    return this.catalog.updateProduct(id, dto);
  }

  @Post('categories')
  @RequirePermissions('catalog:write')
  createCategory(@Body(new ZodValidationPipe(CreateCategorySchema)) dto: CreateCategoryInput) {
    return this.catalog.createCategory(dto);
  }
}
