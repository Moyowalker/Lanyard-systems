import { Body, Controller, HttpCode, Ip, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  StaffLoginInput,
  StaffLoginSchema,
  StaffMfaVerifyInput,
  StaffMfaVerifySchema,
} from '@lanyard/contracts';

import { Public } from '../../../core/auth/auth.decorators';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe';
import { StaffAuthService } from '../application/staff-auth.service';

@ApiTags('auth')
@Controller('auth/staff')
export class StaffAuthController {
  constructor(private readonly staffAuth: StaffAuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body(new ZodValidationPipe(StaffLoginSchema)) dto: StaffLoginInput, @Ip() ip: string) {
    return this.staffAuth.login(dto.email, dto.password, { ip });
  }

  @Public()
  @Post('mfa/verify')
  @HttpCode(200)
  verifyMfa(
    @Body(new ZodValidationPipe(StaffMfaVerifySchema)) dto: StaffMfaVerifyInput,
    @Ip() ip: string,
  ) {
    return this.staffAuth.verifyMfa(dto.mfaToken, dto.code, { ip });
  }
}
