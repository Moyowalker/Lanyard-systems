import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthTokens, ErrorCode, PrincipalType } from '@lanyard/contracts';

import { StaffUser } from '../infrastructure/identity.schemas';
import { SessionService } from './session.service';
import { TokenService } from '../../../core/security/token.service';
import { AuthzService } from '../../authz/application/authz.service';
import { DomainError } from '../../../core/errors/domain-error';

/** Realm-agnostic session operations: refresh (with rotation) and logout. */
@Injectable()
export class AuthService {
  constructor(
    @InjectModel(StaffUser.name) private readonly staffModel: Model<StaffUser>,
    private readonly sessions: SessionService,
    private readonly tokens: TokenService,
    private readonly authz: AuthzService,
  ) {}

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const rotated = await this.sessions.rotate(refreshToken);

    let roles: string[] = [];
    let permissions: string[] = [];
    let branchScope: string[] = [];

    if (rotated.principalType === PrincipalType.STAFF) {
      const staff = await this.staffModel.findById(rotated.principalId);
      if (!staff) throw new DomainError(ErrorCode.SESSION_INVALID, 'Staff no longer exists');
      const resolved = await this.authz.resolveForRoles(staff.roleIds);
      roles = resolved.roleKeys;
      permissions = resolved.permissions;
      branchScope = (staff.branchScope ?? []).map(String);
    }

    const accessToken = this.tokens.signAccess({
      sub: rotated.principalId,
      realm: rotated.principalType === PrincipalType.STAFF ? 'staff' : 'customer',
      roles,
      permissions,
      branchScope,
      sessionId: rotated.sessionId,
    });

    return {
      accessToken,
      refreshToken: rotated.refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.tokens.accessTtlSeconds,
    };
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessions.revoke(sessionId);
  }
}
