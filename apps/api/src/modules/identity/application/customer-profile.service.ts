import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  CustomerAddressInput,
  CustomerProfileDto,
  ErrorCode,
  OtpChannel,
  OtpPurpose,
  UpdateCustomerProfileInput,
} from '@lanyard/contracts';

import { Customer, CustomerDocument } from '../infrastructure/identity.schemas';
import { OtpService, OtpIssueResult } from './otp.service';
import { DomainError } from '../../../core/errors/domain-error';

/**
 * Customer self-service: profile edits, saved addresses, and email verification.
 * Operates only on the authenticated customer's own document — no cross-account access.
 */
@Injectable()
export class CustomerProfileService {
  constructor(
    @InjectModel(Customer.name) private readonly customerModel: Model<Customer>,
    private readonly otp: OtpService,
  ) {}

  async getProfile(customerId: string): Promise<CustomerProfileDto> {
    const customer = await this.load(customerId);
    return this.toDto(customer);
  }

  async updateProfile(
    customerId: string,
    input: UpdateCustomerProfileInput,
  ): Promise<CustomerProfileDto> {
    const customer = await this.load(customerId);

    if (input.firstName !== undefined) customer.firstName = input.firstName;
    if (input.lastName !== undefined) customer.lastName = input.lastName;
    if (input.email !== undefined) {
      const normalized = input.email.toLowerCase().trim();
      // Changing the email invalidates any prior verification.
      if (normalized !== customer.email) {
        customer.email = normalized;
        customer.emailVerified = false;
      }
    }

    try {
      await customer.save();
    } catch (err) {
      if (this.isDuplicateKey(err)) {
        throw new DomainError(ErrorCode.CONFLICT, 'That email is already in use by another account');
      }
      throw err;
    }
    return this.toDto(customer);
  }

  async replaceAddresses(
    customerId: string,
    addresses: CustomerAddressInput[],
  ): Promise<CustomerProfileDto> {
    const customer = await this.load(customerId);
    customer.set('addresses', addresses);
    await customer.save();
    return this.toDto(customer);
  }

  /** Issue an email OTP to the customer's own email (verification). */
  async requestEmailVerification(customerId: string): Promise<OtpIssueResult> {
    const customer = await this.load(customerId);
    if (!customer.email) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        'Add an email to your profile before verifying it',
      );
    }
    if (customer.emailVerified) {
      throw new DomainError(ErrorCode.CONFLICT, 'Your email is already verified');
    }
    return this.otp.issue(OtpChannel.EMAIL, customer.email, OtpPurpose.VERIFY);
  }

  async confirmEmailVerification(customerId: string, code: string): Promise<CustomerProfileDto> {
    const customer = await this.load(customerId);
    if (!customer.email) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'No email on file to verify');
    }
    await this.otp.verify(customer.email, OtpPurpose.VERIFY, code);
    customer.emailVerified = true;
    await customer.save();
    return this.toDto(customer);
  }

  private async load(customerId: string): Promise<CustomerDocument> {
    const customer = await this.customerModel.findById(customerId);
    if (!customer) throw new DomainError(ErrorCode.NOT_FOUND, 'Account not found');
    return customer;
  }

  private toDto(c: CustomerDocument): CustomerProfileDto {
    return {
      id: c._id.toString(),
      firstName: c.firstName,
      lastName: c.lastName,
      phone: c.phone,
      phoneVerified: c.phoneVerified,
      email: c.email,
      emailVerified: c.emailVerified,
      marketingConsent: c.consent?.marketing ?? false,
      addresses: (c.addresses ?? []).map((a) => ({
        label: a.label,
        line1: a.line1,
        line2: a.line2,
        city: a.city,
        state: a.state,
        country: a.country,
        landmark: a.landmark,
        contactPhone: a.contactPhone,
      })),
    };
  }

  private isDuplicateKey(err: unknown): boolean {
    return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
  }
}
