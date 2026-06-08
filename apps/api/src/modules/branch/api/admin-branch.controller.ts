import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CreateBranchInput,
  CreateBranchSchema,
  PaginationQuery,
  PaginationQuerySchema,
  UpdateBranchInput,
  UpdateBranchSchema,
} from '@lanyard/contracts';

import { RequirePermissions, RequireRealm } from '../../../core/auth/auth.decorators';
import { PermissionsGuard, RealmGuard } from '../../../core/auth/authz.guards';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe';
import { BranchService } from '../application/branch.service';

/** Branch administration (org-level; not branch-scoped). Staff realm + branch perms. */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/branches')
@UseGuards(RealmGuard, PermissionsGuard)
@RequireRealm('staff')
export class AdminBranchController {
  constructor(private readonly branches: BranchService) {}

  @Get()
  @RequirePermissions('branch:read')
  list(@Query(new ZodValidationPipe(PaginationQuerySchema)) query: PaginationQuery) {
    return this.branches.listAdmin(query);
  }

  @Post()
  @RequirePermissions('branch:write')
  create(@Body(new ZodValidationPipe(CreateBranchSchema)) dto: CreateBranchInput) {
    return this.branches.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('branch:write')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateBranchSchema)) dto: UpdateBranchInput,
  ) {
    return this.branches.update(id, dto);
  }
}
