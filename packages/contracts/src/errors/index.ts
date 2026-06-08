// Canonical error codes. The API maps domain errors to these; clients (and the
// generated api-client) switch on `code`, never on human-readable messages.

export enum ErrorCode {
  // generic
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  INTERNAL = 'INTERNAL',

  // authentication
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  SESSION_INVALID = 'SESSION_INVALID',
  REFRESH_REUSE_DETECTED = 'REFRESH_REUSE_DETECTED',

  // otp
  OTP_INVALID = 'OTP_INVALID',
  OTP_EXPIRED = 'OTP_EXPIRED',
  OTP_MAX_ATTEMPTS = 'OTP_MAX_ATTEMPTS',

  // mfa
  MFA_REQUIRED = 'MFA_REQUIRED',
  MFA_INVALID = 'MFA_INVALID',

  // authorization
  FORBIDDEN = 'FORBIDDEN',
  REALM_MISMATCH = 'REALM_MISMATCH',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  BRANCH_SCOPE_VIOLATION = 'BRANCH_SCOPE_VIOLATION',

  // identity
  CUSTOMER_EXISTS = 'CUSTOMER_EXISTS',
  ACCOUNT_SUSPENDED = 'ACCOUNT_SUSPENDED',
}

/** Shape returned in the `error` envelope (see docs/architecture/06 §2). */
export interface ApiErrorBody {
  code: ErrorCode | string;
  message: string;
  details?: Array<{ field?: string; issue: string }>;
  traceId?: string;
}
