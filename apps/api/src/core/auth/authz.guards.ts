import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALL_BRANCHES, ErrorCode } from '@lanyard/contracts';

import { Realm } from '../security/token.service';
import { BRANCH_SCOPE_KEY, BranchScopeConfig, PERMISSIONS_KEY, REALM_KEY } from './auth.decorators';
import { AuthPrincipal } from './principal';

function getPrincipal(context: ExecutionContext): AuthPrincipal {
  const request = context.switchToHttp().getRequest<{ principal?: AuthPrincipal }>();
  if (!request.principal) {
    throw new UnauthorizedException({
      code: ErrorCode.UNAUTHENTICATED,
      message: 'Not authenticated',
    });
  }
  return request.principal;
}

/** Restricts the route to the realm declared by @RequireRealm. */
@Injectable()
export class RealmGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Realm>(REALM_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;
    const principal = getPrincipal(context);
    if (principal.realm !== required) {
      throw new ForbiddenException({
        code: ErrorCode.REALM_MISMATCH,
        message: `This endpoint requires the ${required} realm`,
      });
    }
    return true;
  }
}

/** Requires all permissions declared by @RequirePermissions. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const principal = getPrincipal(context);
    const missing = required.filter((p) => !principal.permissions.includes(p));
    if (missing.length > 0) {
      throw new ForbiddenException({
        code: ErrorCode.PERMISSION_DENIED,
        message: `Missing permission(s): ${missing.join(', ')}`,
      });
    }
    return true;
  }
}

/** Enforces branch scope per @BranchScoped configuration. */
@Injectable()
export class BranchScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const config = this.reflector.getAllAndOverride<BranchScopeConfig>(BRANCH_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!config) return true;

    const principal = getPrincipal(context);
    // Staff with ALL scope bypass branch restriction.
    if (principal.branchScope.includes(ALL_BRANCHES)) return true;

    const branchId = this.resolveBranchId(context, config);
    if (!branchId) {
      throw new ForbiddenException({
        code: ErrorCode.BRANCH_SCOPE_VIOLATION,
        message: 'Branch context required',
      });
    }
    if (!principal.branchScope.includes(branchId)) {
      throw new ForbiddenException({
        code: ErrorCode.BRANCH_SCOPE_VIOLATION,
        message: 'Outside your branch scope',
      });
    }
    return true;
  }

  private resolveBranchId(
    context: ExecutionContext,
    config: BranchScopeConfig,
  ): string | undefined {
    const request = context.switchToHttp().getRequest<{
      params: Record<string, string>;
      body: Record<string, unknown>;
      headers: Record<string, string | undefined>;
    }>();
    switch (config.from) {
      case 'param':
        return request.params?.[config.key ?? 'branchId'];
      case 'body':
        return request.body?.[config.key ?? 'branchId'] as string | undefined;
      case 'header':
      default:
        return request.headers?.[config.key ?? 'x-branch-id'];
    }
  }
}
