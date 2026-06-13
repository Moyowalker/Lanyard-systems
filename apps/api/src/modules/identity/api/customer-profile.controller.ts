import { Body, Controller, Get, HttpCode, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  EmailVerifyConfirmInput,
  EmailVerifyConfirmSchema,
  ReplaceAddressesInput,
  ReplaceAddressesSchema,
  UpdateCustomerProfileInput,
  UpdateCustomerProfileSchema,
} from '@lanyard/contracts';

import { CurrentUser, RequireRealm } from '../../../core/auth/auth.decorators';
import { RealmGuard } from '../../../core/auth/authz.guards';
import { AuthPrincipal } from '../../../core/auth/principal';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe';
import { CustomerProfileService } from '../application/customer-profile.service';

/** Customer self-service profile, saved addresses, and email verification. */
@ApiTags('identity')
@ApiBearerAuth()
@Controller('me')
@UseGuards(RealmGuard)
@RequireRealm('customer')
export class CustomerProfileController {
  constructor(private readonly profile: CustomerProfileService) {}

  @Get('profile')
  get(@CurrentUser() user: AuthPrincipal) {
    return this.profile.getProfile(user.sub);
  }

  @Patch('profile')
  update(
    @CurrentUser() user: AuthPrincipal,
    @Body(new ZodValidationPipe(UpdateCustomerProfileSchema)) dto: UpdateCustomerProfileInput,
  ) {
    return this.profile.updateProfile(user.sub, dto);
  }

  @Put('addresses')
  replaceAddresses(
    @CurrentUser() user: AuthPrincipal,
    @Body(new ZodValidationPipe(ReplaceAddressesSchema)) dto: ReplaceAddressesInput,
  ) {
    return this.profile.replaceAddresses(user.sub, dto.addresses);
  }

  @Post('email/verify/request')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 5 * 60_000 } })
  requestEmailVerification(@CurrentUser() user: AuthPrincipal) {
    return this.profile.requestEmailVerification(user.sub);
  }

  @Post('email/verify/confirm')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 5 * 60_000 } })
  confirmEmailVerification(
    @CurrentUser() user: AuthPrincipal,
    @Body(new ZodValidationPipe(EmailVerifyConfirmSchema)) dto: EmailVerifyConfirmInput,
  ) {
    return this.profile.confirmEmailVerification(user.sub, dto.code);
  }
}
