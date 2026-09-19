import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { randomToken } from './crypto.util';

export type Realm = 'customer' | 'staff';
export const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;

/** Claims carried in the access token. */
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
  constructor(private readonly jwt: JwtService) {}

  signAccess(claims: Omit<AccessTokenClaims, 'typ'>): string {
    return this.jwt.sign({ ...claims, typ: 'access' } satisfies AccessTokenClaims);
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
