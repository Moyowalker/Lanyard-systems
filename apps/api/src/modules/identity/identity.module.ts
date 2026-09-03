import { Module } from '@nestjs/common';

import { AuthzModule } from '../authz/authz.module';
import { OtpService } from './application/otp.service';
import { SessionService } from './application/session.service';
import { CustomerAuthService } from './application/customer-auth.service';
import { CustomerProfileService } from './application/customer-profile.service';
import { StaffAdminService } from './application/staff-admin.service';
import { StaffAuthService } from './application/staff-auth.service';
import { AuthService } from './application/auth.service';
import { StaffDirectoryService } from './application/staff-directory.service';
import { CustomerAuthController } from './api/customer-auth.controller';
import { CustomerProfileController } from './api/customer-profile.controller';
import { StaffAuthController } from './api/staff-auth.controller';
import { AuthController } from './api/auth.controller';
import { MeController } from './api/me.controller';
import { AdminPingController } from './api/admin-ping.controller';
import { AdminStaffController } from './api/admin-staff.controller';

/**
 * Identity & authentication. Models come from the global ModelsModule; security
 * primitives (PasswordService, TokenService) from the global SecurityModule.
 */
@Module({
  imports: [AuthzModule],
  controllers: [
    CustomerAuthController,
    CustomerProfileController,
    StaffAuthController,
    AuthController,
    MeController,
    AdminPingController,
    AdminStaffController,
  ],
  providers: [
    OtpService,
    SessionService,
    CustomerAuthService,
    CustomerProfileService,
    StaffAdminService,
    StaffAuthService,
    AuthService,
    StaffDirectoryService,
  ],
  // CustomerAuthService is exported for POS; SessionService is used by the global auth guard.
  exports: [CustomerAuthService, SessionService],
})
export class IdentityModule {}
