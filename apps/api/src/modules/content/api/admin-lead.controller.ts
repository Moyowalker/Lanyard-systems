import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LeadListQuery, LeadListQuerySchema } from '@lanyard/contracts';

import { RequirePermissions, RequireRealm } from '../../../core/auth/auth.decorators';
import { PermissionsGuard, RealmGuard } from '../../../core/auth/authz.guards';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe';
import { LeadService } from '../application/lead.service';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/leads')
@UseGuards(RealmGuard, PermissionsGuard)
@RequireRealm('staff')
export class AdminLeadController {
  constructor(private readonly leads: LeadService) {}

  @Get()
  @RequirePermissions('audit:read')
  list(@Query(new ZodValidationPipe(LeadListQuerySchema)) query: LeadListQuery) {
    return this.leads.listAdmin(query);
  }
}
