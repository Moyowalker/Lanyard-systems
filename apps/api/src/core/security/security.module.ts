import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { PasswordService } from './password.service';
import { TokenService } from './token.service';

/**
 * Global crypto/identity primitives: password hashing and JWT signing/verification.
 * Marked @Global so guards and auth services can inject TokenService/PasswordService
 * without re-importing this module everywhere.
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { issuer: config.get<string>('JWT_ISSUER', 'lanyard') },
      }),
    }),
  ],
  providers: [PasswordService, TokenService],
  exports: [PasswordService, TokenService],
})
export class SecurityModule {}
