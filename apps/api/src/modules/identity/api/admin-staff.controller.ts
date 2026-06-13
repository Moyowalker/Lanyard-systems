import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  CreateStaffInput,
  CreateStaffSchema,
  ResetStaffPasswordInput,
  ResetStaffPasswordSchema,
  UpdateStaffInput,
  UpdateStaffSchema,
} from '@lanyard/contracts';

import { CurrentUser, RequirePermissions, RequireRealm } from '../../../core/auth/auth.decorators';
import { PermissionsGuard, RealmGuard } from '../../../core/auth/authz.guards';
import { AuthPrincipal } from '../../../core/auth/principal';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe';
import { StaffAdminService } from '../application/staff-admin.service';
import {
  StaffDirectoryService,
  type StaffLookupQuery,
} from '../application/staff-directory.service';

const StaffLookupQuerySchema = z.object({
  q: z.string().trim().min(2).max(80),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/staff')
@UseGuards(RealmGuard, PermissionsGuard)
@RequireRealm('staff')
export class AdminStaffController {
  constructor(
    private readonly staffDirectory: StaffDirectoryService,
    private readonly staffAdmin: StaffAdminService,
  ) {}

  /** Pharmacist typeahead for branch assignment (declared before :id). */
  @Get('lookup')
  @RequirePermissions('branch:write')
  async lookup(@Query(new ZodValidationPipe(StaffLookupQuerySchema)) query: StaffLookupQuery) {
    return { data: await this.staffDirectory.lookupPharmacists(query) };
  }

  @Get()
  @RequirePermissions('staff:read')
  list() {
    return this.staffAdmin.list();
  }

  @Post()
  @RequirePermissions('staff:write')
  create(
    @CurrentUser() user: AuthPrincipal,
    @Body(new ZodValidationPipe(CreateStaffSchema)) dto: CreateStaffInput,
  ) {
    return this.staffAdmin.create(user, dto);
  }

  @Get(':id')
  @RequirePermissions('staff:read')
  get(@Param('id') id: string) {
    return this.staffAdmin.get(id);
  }

  @Patch(':id')
  @RequirePermissions('staff:write')
  update(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateStaffSchema)) dto: UpdateStaffInput,
  ) {
    return this.staffAdmin.update(user, id, dto);
  }

  @Post(':id/reset-password')
  @HttpCode(204)
  @RequirePermissions('staff:write')
  async resetPassword(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(ResetStaffPasswordSchema)) dto: ResetStaffPasswordInput,
  ): Promise<void> {
    await this.staffAdmin.resetPassword(user, id, dto.password);
  }
}
