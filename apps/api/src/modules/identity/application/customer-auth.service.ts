import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AccountStatus,
  AuthTokens,
  CustomerRegisterInput,
  ErrorCode,
  GuestCheckoutInput,
  OtpChannel,
  OtpPurpose,
  PrincipalType,
} from '@lanyard/contracts';

import { Customer, CustomerDocument } from '../infrastructure/identity.schemas';
import { OtpService, OtpIssueResult } from './otp.service';
import { SessionService } from './session.service';
import { TokenService } from '../../../core/security/token.service';
import { DomainError } from '../../../core/errors/domain-error';

/** Customer authentication: phone-first, OTP-based (doc 07). */
@Injectable()
export class CustomerAuthService {
  constructor(
    @InjectModel(Customer.name) private readonly customerModel: Model<Customer>,
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
    private readonly tokens: TokenService,
  ) {}

  async register(input: CustomerRegisterInput): Promise<{ customerId: string } & OtpIssueResult> {
    const existing = await this.customerModel.findOne({ phone: input.phone }).lean();
    if (existing) {
      throw new DomainError(ErrorCode.CUSTOMER_EXISTS, 'An account with this phone already exists');
    }
    const customer = await this.customerModel.create({
      phone: input.phone,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      status: AccountStatus.ACTIVE,
      consent: { marketing: input.marketingConsent ?? false, version: 'v1', at: new Date() },
    });
    const otp = await this.otp.issue(OtpChannel.SMS, input.phone, OtpPurpose.VERIFY);
    return { customerId: customer._id.toString(), ...otp };
  }

  /**
   * Guest checkout: create or reuse a lightweight (unverified, password-less) customer
   * by phone and issue a normal session, so the rest of checkout works unchanged. To
   * prevent account takeover, a *claimed* account (phone-verified or password-set) is
   * never silently signed in — the guest is told to sign in instead.
   */
  async guestSession(input: GuestCheckoutInput, context?: { ip?: string }): Promise<AuthTokens> {
    const existing = await this.customerModel
      .findOne({ phone: input.phone })
      .select('+passwordHash');
    let customer: CustomerDocument;
    if (existing) {
      if (existing.phoneVerified || existing.passwordHash) {
        throw new DomainError(
          ErrorCode.CUSTOMER_EXISTS,
          'An account with this phone already exists. Please sign in to continue.',
        );
      }
      existing.firstName = input.firstName;
      existing.lastName = input.lastName;
      if (input.email) existing.email = input.email;
      if (existing.status !== AccountStatus.ACTIVE) existing.status = AccountStatus.ACTIVE;
      customer = existing;
    } else {
      customer = new this.customerModel({
        phone: input.phone,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        status: AccountStatus.ACTIVE,
        consent: { marketing: false, version: 'v1', at: new Date() },
      });
    }
    customer.lastLoginAt = new Date();
    try {
      await customer.save();
    } catch (err) {
      if (typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000) {
        throw new DomainError(
          ErrorCode.CUSTOMER_EXISTS,
          'Those contact details are already in use. Please sign in to continue.',
        );
      }
      throw err;
    }
    return this.issueTokens(customer, context);
  }

  async requestOtp(phone: string, purpose: OtpPurpose): Promise<OtpIssueResult> {
    // NOTE: throws NOT_FOUND for login to a missing account; production should return a
    // uniform response to avoid account enumeration (doc 07 §9). Kept explicit for dev.
    if (purpose === OtpPurpose.LOGIN) {
      const exists = await this.customerModel.exists({ phone });
      if (!exists) throw new DomainError(ErrorCode.NOT_FOUND, 'No account for this phone');
    }
    return this.otp.issue(OtpChannel.SMS, phone, purpose);
  }

  async verifyOtp(
    phone: string,
    purpose: OtpPurpose,
    code: string,
    context?: { ip?: string },
  ): Promise<AuthTokens> {
    await this.otp.verify(phone, purpose, code);

    const customer = await this.customerModel.findOne({ phone });
    if (!customer) throw new DomainError(ErrorCode.NOT_FOUND, 'Account not found');
    if (customer.status !== AccountStatus.ACTIVE) {
      throw new DomainError(ErrorCode.ACCOUNT_SUSPENDED, 'Account is not active');
    }

    if (purpose === OtpPurpose.VERIFY && !customer.phoneVerified) {
      customer.phoneVerified = true;
    }
    customer.lastLoginAt = new Date();
    await customer.save();

    return this.issueTokens(customer, context);
  }

  private async issueTokens(
    customer: CustomerDocument,
    context?: { ip?: string },
  ): Promise<AuthTokens> {
    const session = await this.sessions.issue(customer._id, PrincipalType.CUSTOMER, context);
    const accessToken = this.tokens.signAccess({
      sub: customer._id.toString(),
      realm: 'customer',
      roles: [],
      permissions: [],
      branchScope: [],
      sessionId: session.sessionId,
    });
    return {
      accessToken,
      refreshToken: session.refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.tokens.accessTtlSeconds,
    };
  }
}
