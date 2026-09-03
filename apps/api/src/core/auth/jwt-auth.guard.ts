import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '@lanyard/contracts';

import { TokenService } from '../security/token.service';
import { IS_PUBLIC_KEY } from './auth.decorators';
import { AuthPrincipal } from './principal';
import { SessionService } from '../../modules/identity/application/session.service';

/**
 * Global authentication guard. Verifies the Bearer access token and attaches the
 * principal to the request. Routes marked @Public() are skipped.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      principal?: AuthPrincipal;
    }>();

    const token = this.extractBearer(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHENTICATED,
        message: 'Missing bearer token',
      });
    }

    try {
      const claims = this.tokens.verifyAccess(token);
      await this.sessions.assertActiveAndTouch(claims.sessionId);
      request.principal = {
        sub: claims.sub,
        realm: claims.realm,
        roles: claims.roles,
        permissions: claims.permissions,
        branchScope: claims.branchScope,
        sessionId: claims.sessionId,
      };
      return true;
    } catch {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHENTICATED,
        message: 'Invalid or expired token',
      });
    }
  }

  private extractBearer(header?: string): string | null {
    if (!header) return null;
    const [scheme, value] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && value ? value : null;
  }
}
