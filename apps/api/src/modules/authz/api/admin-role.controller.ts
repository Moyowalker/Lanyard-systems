import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  CreateRoleInput,
  CreateRoleSchema,
  UpdateRoleInput,
  UpdateRoleSchema,
} from '@lanyard/contracts';

import { CurrentUser, RequirePermissions, RequireRealm } from '../../../core/auth/auth.decorators';
import { PermissionsGuard, RealmGuard } from '../../../core/auth/authz.guards';
import { AuthPrincipal } from '../../../core/auth/principal';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe';
import { RoleAdminService } from '../application/role-admin.service';

/** Roles & permissions administration. role:write is super-admin-only (per seed). */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/roles')
@UseGuards(RealmGuard, PermissionsGuard)
@RequireRealm('staff')
export class AdminRoleController {
  constructor(private readonly roles: RoleAdminService) {}

  @Get()
  @RequirePermissions('role:read')
  list() {
    return this.roles.listAll();
  }

  @Post()
  @RequirePermissions('role:write')
  create(
    @CurrentUser() user: AuthPrincipal,
    @Body(new ZodValidationPipe(CreateRoleSchema)) dto: CreateRoleInput,
  ) {
    return this.roles.createRole(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('role:write')
  update(
    @CurrentUser() user: AuthPrincipal,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateRoleSchema)) dto: UpdateRoleInput,
  ) {
    return this.roles.updateRole(user, id, dto);
  }
}
