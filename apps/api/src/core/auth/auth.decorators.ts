import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Realm } from '../security/token.service';
import { AuthPrincipal } from './principal';

/** Marks a route as open — JwtAuthGuard skips authentication. */
export const IS_PUBLIC_KEY = 'auth:isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restrict a route to a single identity realm (customer | staff). */
export const REALM_KEY = 'auth:realm';
export const RequireRealm = (realm: Realm) => SetMetadata(REALM_KEY, realm);

/** Require the caller to hold ALL listed permission keys (e.g. 'rx:verify'). */
export const PERMISSIONS_KEY = 'auth:permissions';
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Enforce branch scope. `source` tells the guard where to read the target branch id:
 * a route param, the X-Branch-Id header, or the request body field. Staff with 'ALL'
 * scope always pass. (Resource-derived branch checks live in services for now.)
 */
export interface BranchScopeConfig {
  from: 'param' | 'header' | 'body';
  key?: string; // defaults: param 'branchId', header 'x-branch-id', body 'branchId'
}
export const BRANCH_SCOPE_KEY = 'auth:branchScope';
export const BranchScoped = (config: BranchScopeConfig = { from: 'header' }) =>
  SetMetadata(BRANCH_SCOPE_KEY, config);

/** Inject the authenticated principal into a handler param. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPrincipal | undefined => {
    const request = ctx.switchToHttp().getRequest<{ principal?: AuthPrincipal }>();
    return request.principal;
  },
);
