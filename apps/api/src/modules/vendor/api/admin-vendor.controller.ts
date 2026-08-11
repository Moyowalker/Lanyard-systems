import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CreateVendorInput,
  CreateVendorSchema,
  UpdateVendorInput,
  UpdateVendorSchema,
  VendorQuery,
  VendorQuerySchema,
} from '@lanyard/contracts';

import { RequirePermissions, RequireRealm } from '../../../core/auth/auth.decorators';
import { PermissionsGuard, RealmGuard } from '../../../core/auth/authz.guards';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe';
import { VendorService } from '../application/vendor.service';

/** Vendor (supplier) registry — org-level; not branch-scoped. Staff realm + vendor perms. */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/vendors')
@UseGuards(RealmGuard, PermissionsGuard)
@RequireRealm('staff')
export class AdminVendorController {
  constructor(private readonly vendors: VendorService) {}

  @Get()
  @RequirePermissions('vendor:read')
  list(@Query(new ZodValidationPipe(VendorQuerySchema)) query: VendorQuery) {
    return this.vendors.listAdmin(query);
  }

  @Post()
  @RequirePermissions('vendor:write')
  async create(@Body(new ZodValidationPipe(CreateVendorSchema)) dto: CreateVendorInput) {
    return { data: await this.vendors.create(dto) };
  }

  @Patch(':id')
  @RequirePermissions('vendor:write')
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateVendorSchema)) dto: UpdateVendorInput,
  ) {
    return { data: await this.vendors.update(id, dto) };
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('vendor:write')
  async remove(@Param('id') id: string): Promise<void> {
    await this.vendors.softDelete(id);
  }
}
