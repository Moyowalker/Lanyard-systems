import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { randomToken, parseDurationMs } from './crypto.util';

export type Realm = 'customer' | 'staff';

/** Claims carried in the short-lived access token. */
export interface AccessTokenClaims {
  sub: string;
  realm: Realm;
  roles: string[];
  permissions: string[];
  branchScope: string[];
  sessionId: string;
  typ: 'access';
}

/** Claims in the short-lived MFA step-up token issued between password and TOTP. */
export interface MfaTokenClaims {
  sub: string;
  typ: 'mfa';
}

/**
 * Issues/verifies JWT access tokens and mints opaque refresh tokens.
 *
 * Phase-1 uses a symmetric HS256 secret (JWT_SECRET). Production target is
 * asymmetric RS256 with rotated keys (doc 07) — only this service changes.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  get accessTtlSeconds(): number {
    return Math.floor(parseDurationMs(this.config.get<string>('JWT_ACCESS_TTL', '30m')) / 1000);
  }

  get refreshTtlMs(): number {
    return parseDurationMs(this.config.get<string>('JWT_REFRESH_TTL', '30d'));
  }

  signAccess(claims: Omit<AccessTokenClaims, 'typ'>): string {
    // expiresIn as a number = seconds (avoids the ms StringValue template-literal type).
    return this.jwt.sign({ ...claims, typ: 'access' } satisfies AccessTokenClaims, {
      expiresIn: this.accessTtlSeconds,
    });
  }

  signMfa(sub: string): string {
    return this.jwt.sign({ sub, typ: 'mfa' } satisfies MfaTokenClaims, { expiresIn: 300 });
  }

  verifyAccess(token: string): AccessTokenClaims {
    const claims = this.jwt.verify<AccessTokenClaims>(token);
    if (claims.typ !== 'access') throw new Error('Not an access token');
    return claims;
  }

  verifyMfa(token: string): MfaTokenClaims {
    const claims = this.jwt.verify<MfaTokenClaims>(token);
    if (claims.typ !== 'mfa') throw new Error('Not an MFA token');
    return claims;
  }

  /** New opaque refresh token (the raw value returned to the client; we store its hash). */
  newRefreshToken(): string {
    return randomToken();
  }
}
