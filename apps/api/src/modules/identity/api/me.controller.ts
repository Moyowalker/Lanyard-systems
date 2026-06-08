import { Controller, Get } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MeResponse } from '@lanyard/contracts';

import { CurrentUser } from '../../../core/auth/auth.decorators';
import { AuthPrincipal } from '../../../core/auth/principal';
import { Customer, StaffUser } from '../infrastructure/identity.schemas';

/** Returns the authenticated principal plus a minimal profile. Works for both realms. */
@ApiTags('identity')
@ApiBearerAuth()
@Controller()
export class MeController {
  constructor(
    @InjectModel(Customer.name) private readonly customerModel: Model<Customer>,
    @InjectModel(StaffUser.name) private readonly staffModel: Model<StaffUser>,
  ) {}

  @Get('me')
  async me(@CurrentUser() principal: AuthPrincipal): Promise<MeResponse> {
    const profile: MeResponse['profile'] = {};
    if (principal.realm === 'customer') {
      const c = await this.customerModel.findById(principal.sub).lean();
      if (c)
        Object.assign(profile, {
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          phone: c.phone,
        });
    } else {
      const s = await this.staffModel.findById(principal.sub).lean();
      if (s)
        Object.assign(profile, {
          firstName: s.firstName,
          lastName: s.lastName,
          email: s.email,
          phone: s.phone,
        });
    }

    return {
      id: principal.sub,
      realm: principal.realm,
      roles: principal.roles,
      permissions: principal.permissions,
      branchScope: principal.branchScope,
      profile,
    };
  }
}
