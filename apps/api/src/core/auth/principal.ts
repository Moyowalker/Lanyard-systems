import { Realm } from '../security/token.service';

/** The authenticated caller, attached to `request.principal` by JwtAuthGuard. */
export interface AuthPrincipal {
  sub: string;
  realm: Realm;
  roles: string[];
  permissions: string[];
  /** [] for customers; ['ALL'] or branch ids for staff. */
  branchScope: string[];
  sessionId: string;
}

/** Express request augmented with the authenticated principal. */
export interface RequestWithPrincipal {
  principal?: AuthPrincipal;
  params: Record<string, string>;
  query: Record<string, unknown>;
  body: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
}
