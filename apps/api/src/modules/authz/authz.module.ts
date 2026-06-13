import { Module } from '@nestjs/common';
import { AuthzService } from './application/authz.service';
import { RoleAdminService } from './application/role-admin.service';
import { AdminRoleController } from './api/admin-role.controller';

/**
 * Authorization domain. Models come from the global ModelsModule; this module
 * exposes AuthzService for token issuance and guard re-validation, and the admin
 * role/permission management surface.
 */
@Module({
  controllers: [AdminRoleController],
  providers: [AuthzService, RoleAdminService],
  exports: [AuthzService],
})
export class AuthzModule {}
