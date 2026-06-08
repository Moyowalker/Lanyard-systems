import { Body, Controller, HttpCode, Ip, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  CustomerRegisterInput,
  CustomerRegisterSchema,
  OtpRequestInput,
  OtpRequestSchema,
  OtpVerifyInput,
  OtpVerifySchema,
} from '@lanyard/contracts';

import { Public } from '../../../core/auth/auth.decorators';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe';
import { CustomerAuthService } from '../application/customer-auth.service';

@ApiTags('auth')
@Controller('auth/customer')
export class CustomerAuthController {
  constructor(private readonly customerAuth: CustomerAuthService) {}

  @Public()
  @Post('register')
  register(@Body(new ZodValidationPipe(CustomerRegisterSchema)) dto: CustomerRegisterInput) {
    return this.customerAuth.register(dto);
  }

  @Public()
  @Post('otp/request')
  @HttpCode(200)
  requestOtp(@Body(new ZodValidationPipe(OtpRequestSchema)) dto: OtpRequestInput) {
    return this.customerAuth.requestOtp(dto.phone, dto.purpose);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(200)
  verifyOtp(@Body(new ZodValidationPipe(OtpVerifySchema)) dto: OtpVerifyInput, @Ip() ip: string) {
    return this.customerAuth.verifyOtp(dto.phone, dto.purpose, dto.code, { ip });
  }
}
