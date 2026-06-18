import { Body, Controller, HttpCode, Ip, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  ChangePasswordInput,
  ChangePasswordSchema,
  StaffLoginInput,
  StaffLoginSchema,
  StaffMfaVerifyInput,
  StaffMfaVerifySchema,
} from '@lanyard/contracts';

import { CurrentUser, Public, RequireRealm } from '../../../core/auth/auth.decorators';
import { RealmGuard } from '../../../core/auth/authz.guards';
import { AuthPrincipal } from '../../../core/auth/principal';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe';
import { StaffAuthService } from '../application/staff-auth.service';

@ApiTags('auth')
@Controller('auth/staff')
export class StaffAuthController {
  constructor(private readonly staffAuth: StaffAuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 5 * 60_000 } })
  login(@Body(new ZodValidationPipe(StaffLoginSchema)) dto: StaffLoginInput, @Ip() ip: string) {
    return this.staffAuth.login(dto.email, dto.password, { ip });
  }

  @Public()
  @Post('mfa/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 5 * 60_000 } })
  verifyMfa(
    @Body(new ZodValidationPipe(StaffMfaVerifySchema)) dto: StaffMfaVerifyInput,
    @Ip() ip: string,
  ) {
    return this.staffAuth.verifyMfa(dto.mfaToken, dto.code, { ip });
  }

  /** Authenticated self-service password change (also satisfies the rotation policy). */
  @Post('change-password')
  @ApiBearerAuth()
  @HttpCode(204)
  @UseGuards(RealmGuard)
  @RequireRealm('staff')
  async changePassword(
    @CurrentUser() user: AuthPrincipal,
    @Body(new ZodValidationPipe(ChangePasswordSchema)) dto: ChangePasswordInput,
  ): Promise<void> {
    await this.staffAuth.changePassword(user, dto.currentPassword, dto.newPassword);
  }
}
