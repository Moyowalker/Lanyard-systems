import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RefreshInput, RefreshSchema } from '@lanyard/contracts';

import { CurrentUser, Public } from '../../../core/auth/auth.decorators';
import { AuthPrincipal } from '../../../core/auth/principal';
import { ZodValidationPipe } from '../../../core/validation/zod-validation.pipe';
import { AuthService } from '../application/auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body(new ZodValidationPipe(RefreshSchema)) dto: RefreshInput) {
    return this.auth.refresh(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() principal: AuthPrincipal): Promise<void> {
    await this.auth.logout(principal.sessionId);
  }
}
