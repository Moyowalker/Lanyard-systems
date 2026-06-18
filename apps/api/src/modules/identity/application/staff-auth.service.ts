import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { authenticator } from 'otplib';
import {
  AccountStatus,
  ActorType,
  AuthTokens,
  ErrorCode,
  MfaChallenge,
  PrincipalType,
} from '@lanyard/contracts';

import { StaffUser, StaffUserDocument } from '../infrastructure/identity.schemas';
import { PasswordService } from '../../../core/security/password.service';
import { TokenService } from '../../../core/security/token.service';
import { SessionService } from './session.service';
import { AuthzService } from '../../authz/application/authz.service';
import { AuditService } from '../../../core/platform/audit.service';
import { AuthPrincipal } from '../../../core/auth/principal';
import { DomainError } from '../../../core/errors/domain-error';

/** Staff authentication: email + password, with TOTP MFA step-up (doc 07). */
@Injectable()
export class StaffAuthService {
  constructor(
    @InjectModel(StaffUser.name) private readonly staffModel: Model<StaffUser>,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
    private readonly authz: AuthzService,
    private readonly audit: AuditService,
  ) {}

  /** Self-service password change — verifies the current password, then rotates. */
  async changePassword(
    principal: AuthPrincipal,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const staff = await this.staffModel.findById(principal.sub).select('+passwordHash');
    if (!staff) throw new DomainError(ErrorCode.NOT_FOUND, 'Staff not found');
    if (!(await this.passwords.verify(staff.passwordHash, currentPassword))) {
      throw new DomainError(ErrorCode.INVALID_CREDENTIALS, 'Current password is incorrect');
    }
    staff.passwordHash = await this.passwords.hash(newPassword);
    staff.passwordChangedAt = new Date();
    await staff.save();
    await this.audit.record({
      actorId: principal.sub,
      actorType: ActorType.STAFF,
      action: 'staff.change_password',
      targetType: 'staff',
      targetId: principal.sub,
    });
  }

  async login(
    email: string,
    password: string,
    context?: { ip?: string },
  ): Promise<AuthTokens | MfaChallenge> {
    const staff = await this.staffModel.findOne({ email }).select('+passwordHash');
    // Uniform failure for unknown email or bad password (no enumeration).
    if (!staff || !(await this.passwords.verify(staff.passwordHash, password))) {
      throw new DomainError(ErrorCode.INVALID_CREDENTIALS, 'Invalid email or password');
    }
    if (staff.status !== AccountStatus.ACTIVE) {
      throw new DomainError(ErrorCode.ACCOUNT_SUSPENDED, 'Account is not active');
    }

    if (staff.mfaEnabled) {
      return { mfaRequired: true, mfaToken: this.tokens.signMfa(staff._id.toString()) };
    }
    return this.issueTokens(staff, context);
  }

  async verifyMfa(mfaToken: string, code: string, context?: { ip?: string }): Promise<AuthTokens> {
    let sub: string;
    try {
      sub = this.tokens.verifyMfa(mfaToken).sub;
    } catch {
      throw new DomainError(ErrorCode.MFA_INVALID, 'Invalid or expired MFA token');
    }

    const staff = await this.staffModel.findById(sub).select('+mfaSecretRef');
    if (!staff || !staff.mfaEnabled || !staff.mfaSecretRef) {
      throw new DomainError(ErrorCode.MFA_INVALID, 'MFA not configured');
    }
    // Dev: mfaSecretRef holds the TOTP secret directly. Production resolves it from the
    // secrets manager by reference (doc 07/08).
    if (!authenticator.verify({ token: code, secret: staff.mfaSecretRef })) {
      throw new DomainError(ErrorCode.MFA_INVALID, 'Incorrect MFA code');
    }
    return this.issueTokens(staff, context);
  }

  private async issueTokens(
    staff: StaffUserDocument,
    context?: { ip?: string },
  ): Promise<AuthTokens> {
    const { roleKeys, permissions } = await this.authz.resolveForRoles(staff.roleIds);
    const branchScope = (staff.branchScope ?? []).map(String);

    const session = await this.sessions.issue(staff._id, PrincipalType.STAFF, context);
    const accessToken = this.tokens.signAccess({
      sub: staff._id.toString(),
      realm: 'staff',
      roles: roleKeys,
      permissions,
      branchScope,
      sessionId: session.sessionId,
    });

    staff.lastLoginAt = new Date();
    await staff.save();

    return {
      accessToken,
      refreshToken: session.refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.tokens.accessTtlSeconds,
    };
  }
}
