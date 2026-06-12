import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CreateCategoryInput,
  CreateCategorySchema,
  CreateProductInput,
  CreateProductSchema,
  ErrorCode,
  ProductListQuery,
  ProductListQuerySchema,
  UpdateProductInput,
  UpdateProductSchema,
} from '@lanyard/contracts';

import { RequirePermissions, RequireRealm } from '../../../core/auth/auth.decorators';
import { PermissionsGuard, RealmGuard } from '../../../core/auth/authz.guards';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe';
import { CatalogService, UploadedProductImage } from '../application/catalog.service';

const IMAGE_MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

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

  @Post('products/:id/images')
  @RequirePermissions('catalog:write')
  @UseInterceptors(FilesInterceptor('files', 5, { limits: { fileSize: MAX_IMAGE_BYTES } }))
  addProductImages(@Param('id') id: string, @UploadedFiles() files: Express.Multer.File[]) {
    return this.catalog.addProductImages(id, this.mapImages(files));
  }

  @Delete('products/:id/images')
  @RequirePermissions('catalog:write')
  removeProductImage(@Param('id') id: string, @Body() body: { key?: string }) {
    if (!body.key) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Image key is required',
      });
    }
    return this.catalog.removeProductImage(id, body.key);
  }

  @Patch('products/:id/images')
  @RequirePermissions('catalog:write')
  reorderProductImages(@Param('id') id: string, @Body() body: { images?: string[] }) {
    if (!body.images) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'Image order is required',
      });
    }
    return this.catalog.reorderProductImages(id, body.images);
  }

  @Post('categories')
  @RequirePermissions('catalog:write')
  createCategory(@Body(new ZodValidationPipe(CreateCategorySchema)) dto: CreateCategoryInput) {
    return this.catalog.createCategory(dto);
  }

  private mapImages(files: Express.Multer.File[]): UploadedProductImage[] {
    if (!files || files.length === 0) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_FAILED,
        message: 'At least one image is required',
      });
    }
    return files.map((file) => {
      const ext = IMAGE_MIME_EXT[file.mimetype];
      if (!ext) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_FAILED,
          message: `Unsupported image type: ${file.mimetype}`,
        });
      }
      return { buffer: file.buffer, mime: file.mimetype, ext };
    });
  }
}
