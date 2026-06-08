import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser, RequirePermissions, RequireRealm } from '../../../core/auth/auth.decorators';
import { PermissionsGuard, RealmGuard } from '../../../core/auth/authz.guards';
import { AuthPrincipal } from '../../../core/auth/principal';

/**
 * Phase-1 demonstrator that the authorization stack works end-to-end:
 * staff realm + `audit:read` permission required. Remove once real admin
 * endpoints exist.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(RealmGuard, PermissionsGuard)
@RequireRealm('staff')
export class AdminPingController {
  @Get('ping')
  @RequirePermissions('audit:read')
  ping(@CurrentUser() principal: AuthPrincipal) {
    return { pong: true, who: principal.sub, roles: principal.roles };
  }
}
