import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';

import { RequirePermissions, RequireRealm } from '../../../core/auth/auth.decorators';
import { PermissionsGuard, RealmGuard } from '../../../core/auth/authz.guards';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe';
import { StaffDirectoryService, type StaffLookupQuery } from '../application/staff-directory.service';

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
  constructor(private readonly staffDirectory: StaffDirectoryService) {}

  @Get('lookup')
  @RequirePermissions('branch:write')
  async lookup(@Query(new ZodValidationPipe(StaffLookupQuerySchema)) query: StaffLookupQuery) {
    return { data: await this.staffDirectory.lookupPharmacists(query) };
  }
}