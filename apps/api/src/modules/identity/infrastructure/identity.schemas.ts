import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  AccountStatus,
  OtpChannel,
  OtpPurpose,
  PrincipalType,
  ALL_BRANCHES,
} from '@lanyard/contracts';
import {
  baseSchemaOptions,
  E164_REGEX,
  EMAIL_REGEX,
  ConsentSchema,
  Consent,
  AddressSchema,
  Address,
  refProp,
} from '../../../database/schema.helpers';

/* ════════════════════════════════════════════════════════════════════════
 * customers — customer identity realm (phone-first). PHI-adjacent.
 * ════════════════════════════════════════════════════════════════════════ */

export type CustomerDocument = HydratedDocument<Customer>;

@Schema({ ...baseSchemaOptions, collection: 'customers' })
export class Customer {
  @Prop({ required: true, unique: true, match: E164_REGEX, trim: true })
  phone: string;

  @Prop({ type: String, lowercase: true, trim: true, match: EMAIL_REGEX })
  email?: string;

  @Prop({ required: true, trim: true, maxlength: 80 })
  firstName: string;

  @Prop({ required: true, trim: true, maxlength: 80 })
  lastName: string;

  @Prop({ type: Boolean, default: false })
  phoneVerified: boolean;

  @Prop({ type: Boolean, default: false })
  emailVerified: boolean;

  /** Optional — OTP-first login is supported, password is opt-in. Never serialised. */
  @Prop({ type: String, select: false })
  passwordHash?: string;

  @Prop(refProp('Branch', false))
  defaultBranchId?: Types.ObjectId;

  /** Embedded for MVP simplicity; promote to a collection if it grows. */
  @Prop({ type: [AddressSchema], default: [] })
  addresses: Address[];

  @Prop({ type: ConsentSchema, default: () => ({}) })
  consent: Consent;

  @Prop({ type: String, enum: AccountStatus, default: AccountStatus.ACTIVE, index: true })
  status: AccountStatus;

  /** System placeholder for anonymous POS counter sales — never notified or marketed to. */
  @Prop({ type: Boolean, default: false })
  isWalkIn?: boolean;

  @Prop({ type: Date })
  lastLoginAt?: Date;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);
// `phone` uniqueness is declared inline on the @Prop above.
CustomerSchema.index({ email: 1 }, { unique: true, sparse: true }); // optional, but unique when present
CustomerSchema.index({ status: 1, createdAt: -1 });
// Hide secrets even if a query accidentally selects them.
CustomerSchema.set('toJSON', {
  virtuals: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: any, ret: any) => {
    delete ret.passwordHash;
    ret.id = ret._id?.toString?.() ?? ret._id;
    delete ret._id;
    return ret;
  },
});

/* ════════════════════════════════════════════════════════════════════════
 * staff_users — staff identity realm (email + password + MFA).
 * ════════════════════════════════════════════════════════════════════════ */

export type StaffUserDocument = HydratedDocument<StaffUser>;

@Schema({ _id: false })
export class PharmacistProfile {
  @Prop({ required: true, trim: true })
  pcnLicenseNo: string;

  @Prop({ type: Date, required: true })
  licenseExpiry: Date;

  @Prop({ type: Boolean, default: false })
  isSuperintendent: boolean;
}
export const PharmacistProfileSchema = SchemaFactory.createForClass(PharmacistProfile);

@Schema({ ...baseSchemaOptions, collection: 'staff_users' })
export class StaffUser {
  @Prop({ required: true, unique: true, lowercase: true, trim: true, match: EMAIL_REGEX })
  email: string;

  @Prop({ type: String, match: E164_REGEX, trim: true })
  phone?: string;

  @Prop({ required: true, trim: true, maxlength: 80 })
  firstName: string;

  @Prop({ required: true, trim: true, maxlength: 80 })
  lastName: string;

  @Prop({ required: true, select: false })
  passwordHash: string;

  /** When the password was last set — drives the 90-day rotation policy. */
  @Prop({ type: Date })
  passwordChangedAt?: Date;

  @Prop({ type: Boolean, default: false })
  mfaEnabled: boolean;

  /** Pointer/handle into the secrets manager — never the raw TOTP secret. */
  @Prop({ type: String, select: false })
  mfaSecretRef?: string;

  @Prop({ type: [{ type: Types.ObjectId, ref: 'Role' }], default: [], index: true })
  roleIds: Types.ObjectId[];

  /**
   * Branches this staff may act on: an array of branch ids, or the literal "ALL".
   * Guards re-validate the target resource's branchId against this.
   */
  @Prop({ type: [String], default: [], index: true })
  branchScope: (string | typeof ALL_BRANCHES)[];

  /** Present for dispensing staff; required to hold the `rx:verify` permission. */
  @Prop({ type: PharmacistProfileSchema })
  pharmacist?: PharmacistProfile;

  @Prop({ type: String, enum: AccountStatus, default: AccountStatus.ACTIVE, index: true })
  status: AccountStatus;

  @Prop({ type: Date })
  lastLoginAt?: Date;

  @Prop({ type: Date })
  deletedAt?: Date;
}

export const StaffUserSchema = SchemaFactory.createForClass(StaffUser);
// `email` uniqueness and `roleIds`/`branchScope` indexes are declared inline on their @Prop above.
StaffUserSchema.index({ 'pharmacist.licenseExpiry': 1 }, { sparse: true }); // license-expiry alerts
StaffUserSchema.set('toJSON', {
  virtuals: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: any, ret: any) => {
    delete ret.passwordHash;
    delete ret.mfaSecretRef;
    ret.id = ret._id?.toString?.() ?? ret._id;
    delete ret._id;
    return ret;
  },
});

/* ════════════════════════════════════════════════════════════════════════
 * sessions — refresh-token sessions (rotating). TTL auto-expiry.
 * ════════════════════════════════════════════════════════════════════════ */

export type SessionDocument = HydratedDocument<Session>;

@Schema({ ...baseSchemaOptions, collection: 'sessions' })
export class Session {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  principalId: Types.ObjectId;

  @Prop({ type: String, enum: PrincipalType, required: true })
  principalType: PrincipalType;

  /** SHA-256 of the opaque refresh token — never the token itself. */
  @Prop({ required: true, select: false })
  refreshTokenHash: string;

  /** Token-family id for rotation/reuse-detection (revoke whole family on reuse). */
  @Prop({ type: String, required: true, index: true })
  familyId: string;

  @Prop({ type: Object })
  deviceInfo?: Record<string, unknown>;

  @Prop({ type: String })
  ip?: string;

  @Prop({ type: Date, required: true })
  expiresAt: Date;

  @Prop({ type: Date, required: true, index: true })
  lastActivityAt: Date;

  @Prop({ type: Date, required: true, index: true })
  inactivityExpiresAt: Date;

  @Prop({ type: Date })
  revokedAt?: Date;
}

export const SessionSchema = SchemaFactory.createForClass(Session);
SessionSchema.index({ principalId: 1, principalType: 1 });
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL cleanup

/* ════════════════════════════════════════════════════════════════════════
 * otp_challenges — one-time codes (login/verify/reset). Hashed + TTL.
 * ════════════════════════════════════════════════════════════════════════ */

export type OtpChallengeDocument = HydratedDocument<OtpChallenge>;

@Schema({ ...baseSchemaOptions, collection: 'otp_challenges' })
export class OtpChallenge {
  @Prop({ type: String, enum: OtpChannel, required: true })
  channel: OtpChannel;

  /** Phone (E.164) or email the code was sent to. */
  @Prop({ required: true, trim: true })
  target: string;

  /** SHA-256 of the code — never plaintext. */
  @Prop({ required: true, select: false })
  codeHash: string;

  @Prop({ type: String, enum: OtpPurpose, required: true })
  purpose: OtpPurpose;

  @Prop({ type: Number, default: 0 })
  attempts: number;

  @Prop({ type: Number, default: 5 })
  maxAttempts: number;

  @Prop({ type: Date, required: true })
  expiresAt: Date;

  @Prop({ type: Date })
  consumedAt?: Date;
}

export const OtpChallengeSchema = SchemaFactory.createForClass(OtpChallenge);
OtpChallengeSchema.index({ target: 1, purpose: 1, createdAt: -1 });
OtpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL cleanup
