import { Module } from '@nestjs/common';

import { AuthzModule } from '../authz/authz.module';
import { OtpService } from './application/otp.service';
import { SessionService } from './application/session.service';
import { CustomerAuthService } from './application/customer-auth.service';
import { StaffAuthService } from './application/staff-auth.service';
import { AuthService } from './application/auth.service';
import { CustomerAuthController } from './api/customer-auth.controller';
import { StaffAuthController } from './api/staff-auth.controller';
import { AuthController } from './api/auth.controller';
import { MeController } from './api/me.controller';
import { AdminPingController } from './api/admin-ping.controller';

/**
 * Identity & authentication. Models come from the global ModelsModule; security
 * primitives (PasswordService, TokenService) from the global SecurityModule.
 */
@Module({
  imports: [AuthzModule],
  controllers: [
    CustomerAuthController,
    StaffAuthController,
    AuthController,
    MeController,
    AdminPingController,
  ],
  providers: [OtpService, SessionService, CustomerAuthService, StaffAuthService, AuthService],
})
export class IdentityModule {}
