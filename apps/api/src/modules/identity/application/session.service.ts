import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ErrorCode, PrincipalType } from '@lanyard/contracts';

import { Session } from '../infrastructure/identity.schemas';
import { TokenService } from '../../../core/security/token.service';
import { newUuid, sha256Hex } from '../../../core/security/crypto.util';
import { DomainError } from '../../../core/errors/domain-error';

export interface IssuedRefresh {
  sessionId: string;
  familyId: string;
  refreshToken: string; // raw value for the client; only its hash is stored
}

export interface RotatedRefresh extends IssuedRefresh {
  principalId: string;
  principalType: PrincipalType;
}

/**
 * Manages refresh-token sessions with rotation and reuse detection (doc 07).
 * Each issue creates a session in a token "family"; rotation revokes the old row
 * and creates a new one in the same family. Presenting an already-revoked token
 * indicates theft → the whole family is revoked.
 */
@Injectable()
export class SessionService {
  private static readonly INACTIVITY_TTL_MS = 60 * 60 * 1000;
  constructor(
    @InjectModel(Session.name) private readonly sessionModel: Model<Session>,
    private readonly tokens: TokenService,
  ) {}

  private inactivityDeadline(session: Pick<Session, 'inactivityExpiresAt' | 'lastActivityAt'>, now: Date): Date {
    return session.inactivityExpiresAt ?? new Date(
      (session.lastActivityAt?.getTime() ?? now.getTime()) + SessionService.INACTIVITY_TTL_MS,
    );
  }

  async issue(
    principalId: Types.ObjectId,
    principalType: PrincipalType,
    context?: { ip?: string; deviceInfo?: Record<string, unknown> },
  ): Promise<IssuedRefresh> {
    const refreshToken = this.tokens.newRefreshToken();
    const familyId = newUuid();
    const now = new Date();
    const session = await this.sessionModel.create({
      principalId,
      principalType,
      refreshTokenHash: sha256Hex(refreshToken),
      familyId,
      ip: context?.ip,
      deviceInfo: context?.deviceInfo,
      expiresAt: new Date(now.getTime() + this.tokens.refreshTtlMs),
      lastActivityAt: now,
      inactivityExpiresAt: new Date(now.getTime() + SessionService.INACTIVITY_TTL_MS),
    });
    return { sessionId: session._id.toString(), familyId, refreshToken };
  }

  async rotate(refreshToken: string): Promise<RotatedRefresh> {
    const current = await this.sessionModel
      .findOne({ refreshTokenHash: sha256Hex(refreshToken) })
      .select('+refreshTokenHash');

    if (!current) {
      throw new DomainError(ErrorCode.SESSION_INVALID, 'Session not found');
    }
    // Reuse of an already-rotated/revoked token ⇒ likely theft: kill the family.
    if (current.revokedAt) {
      await this.sessionModel.updateMany(
        { familyId: current.familyId },
        { $set: { revokedAt: new Date() } },
      );
      throw new DomainError(ErrorCode.REFRESH_REUSE_DETECTED, 'Refresh token reuse detected');
    }
    if (current.expiresAt.getTime() < Date.now()) {
      throw new DomainError(ErrorCode.SESSION_INVALID, 'Session expired');
    }
    if (this.inactivityDeadline(current, new Date()).getTime() < Date.now()) {
      current.revokedAt = new Date();
      await current.save();
      throw new DomainError(ErrorCode.SESSION_INVALID, 'Session expired due to inactivity');
    }

    current.revokedAt = new Date();
    await current.save();

    const refreshTokenNew = this.tokens.newRefreshToken();
    const now = new Date();
    const next = await this.sessionModel.create({
      principalId: current.principalId,
      principalType: current.principalType,
      refreshTokenHash: sha256Hex(refreshTokenNew),
      familyId: current.familyId,
      ip: current.ip,
      deviceInfo: current.deviceInfo,
      expiresAt: new Date(now.getTime() + this.tokens.refreshTtlMs),
      lastActivityAt: now,
      inactivityExpiresAt: new Date(now.getTime() + SessionService.INACTIVITY_TTL_MS),
    });

    return {
      sessionId: next._id.toString(),
      familyId: current.familyId,
      refreshToken: refreshTokenNew,
      principalId: current.principalId.toString(),
      principalType: current.principalType,
    };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.sessionModel.updateOne({ _id: sessionId }, { $set: { revokedAt: new Date() } });
  }

  async assertActiveAndTouch(sessionId: string): Promise<void> {
    const now = new Date();
    const session = await this.sessionModel.findById(sessionId);
    if (!session || session.revokedAt || session.expiresAt.getTime() < now.getTime()) {
      throw new DomainError(ErrorCode.SESSION_INVALID, 'Session expired');
    }
    if (this.inactivityDeadline(session, now).getTime() < now.getTime()) {
      session.revokedAt = now;
      await session.save();
      throw new DomainError(ErrorCode.SESSION_INVALID, 'Session expired due to inactivity');
    }
    await this.sessionModel.updateOne(
      { _id: session._id },
      { $set: { lastActivityAt: now, inactivityExpiresAt: new Date(now.getTime() + SessionService.INACTIVITY_TTL_MS) } },
    );
  }
}
