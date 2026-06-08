import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OtpChannel, OtpPurpose } from '@lanyard/contracts';

import { OtpChallenge } from '../infrastructure/identity.schemas';
import { randomOtp, sha256Hex } from '../../../core/security/crypto.util';
import { DomainError } from '../../../core/errors/domain-error';
import { ErrorCode } from '@lanyard/contracts';
import { NotificationService } from '../../notification/application/notification.service';

export interface OtpIssueResult {
  challengeId: string;
  /** Only populated outside production, so dev/QA can complete the flow without SMS. */
  devCode?: string;
}

/**
 * Issues and verifies one-time codes. Codes are stored hashed (never plaintext)
 * with an attempt counter and TTL. In non-production the code is logged and
 * returned so the flow is testable without a live SMS provider.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @InjectModel(OtpChallenge.name) private readonly otpModel: Model<OtpChallenge>,
    private readonly config: ConfigService,
    private readonly notifications: NotificationService,
  ) {}

  private get isProd(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  async issue(channel: OtpChannel, target: string, purpose: OtpPurpose): Promise<OtpIssueResult> {
    const ttlSeconds = this.config.get<number>('OTP_TTL_SECONDS', 300);
    const maxAttempts = this.config.get<number>('OTP_MAX_ATTEMPTS', 5);
    const code = randomOtp(6);

    const challenge = await this.otpModel.create({
      channel,
      target,
      codeHash: sha256Hex(code),
      purpose,
      attempts: 0,
      maxAttempts,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    });

    try {
      if (channel === OtpChannel.SMS) {
        await this.notifications.notifyOtp(target, purpose, code, ttlSeconds);
      } else {
        throw new DomainError(ErrorCode.INTERNAL, 'Email OTP is not configured');
      }
    } catch (err) {
      await this.otpModel.deleteOne({ _id: challenge._id });
      this.logger.error(`OTP delivery failed for ${target}: ${(err as Error).message}`);
      throw new DomainError(ErrorCode.INTERNAL, 'Unable to deliver a one-time code right now');
    }

    return {
      challengeId: challenge._id.toString(),
      ...(this.isProd ? {} : { devCode: code }),
    };
  }

  /** Validates a code for target+purpose; throws a DomainError on any failure. */
  async verify(target: string, purpose: OtpPurpose, code: string): Promise<void> {
    const challenge = await this.otpModel
      .findOne({ target, purpose, consumedAt: { $exists: false } })
      .select('+codeHash')
      .sort({ createdAt: -1 });

    if (!challenge) {
      throw new DomainError(ErrorCode.OTP_INVALID, 'No active code for this request');
    }
    if (challenge.expiresAt.getTime() < Date.now()) {
      throw new DomainError(ErrorCode.OTP_EXPIRED, 'Code has expired');
    }
    if (challenge.attempts >= challenge.maxAttempts) {
      throw new DomainError(ErrorCode.OTP_MAX_ATTEMPTS, 'Too many attempts');
    }

    challenge.attempts += 1;
    if (challenge.codeHash !== sha256Hex(code)) {
      await challenge.save();
      throw new DomainError(ErrorCode.OTP_INVALID, 'Incorrect code');
    }

    challenge.consumedAt = new Date();
    await challenge.save();
  }
}
