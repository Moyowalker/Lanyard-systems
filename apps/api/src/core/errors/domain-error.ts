import { ErrorCode } from '@lanyard/contracts';

/** HTTP status for each canonical error code. */
const STATUS_BY_CODE: Record<ErrorCode, number> = {
  [ErrorCode.VALIDATION_FAILED]: 400,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.CONFLICT]: 409,
  [ErrorCode.INTERNAL]: 500,
  [ErrorCode.UNAUTHENTICATED]: 401,
  [ErrorCode.INVALID_CREDENTIALS]: 401,
  [ErrorCode.SESSION_INVALID]: 401,
  [ErrorCode.REFRESH_REUSE_DETECTED]: 401,
  [ErrorCode.OTP_INVALID]: 400,
  [ErrorCode.OTP_EXPIRED]: 400,
  [ErrorCode.OTP_MAX_ATTEMPTS]: 429,
  [ErrorCode.MFA_REQUIRED]: 401,
  [ErrorCode.MFA_INVALID]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.REALM_MISMATCH]: 403,
  [ErrorCode.PERMISSION_DENIED]: 403,
  [ErrorCode.BRANCH_SCOPE_VIOLATION]: 403,
  [ErrorCode.CUSTOMER_EXISTS]: 409,
  [ErrorCode.ACCOUNT_SUSPENDED]: 403,
};

/**
 * Business-rule error carrying a canonical code. Thrown by services; mapped to the
 * standard error envelope + HTTP status by AllExceptionsFilter.
 */
export class DomainError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Array<{ field?: string; issue: string }>,
  ) {
    super(message);
    this.name = 'DomainError';
  }

  get httpStatus(): number {
    return STATUS_BY_CODE[this.code] ?? 400;
  }
}

/** Best-effort canonical code for a bare HTTP status. */
export function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 401:
      return ErrorCode.UNAUTHENTICATED;
    case 403:
      return ErrorCode.FORBIDDEN;
    case 404:
      return ErrorCode.NOT_FOUND;
    case 409:
      return ErrorCode.CONFLICT;
    case 400:
      return ErrorCode.VALIDATION_FAILED;
    default:
      return ErrorCode.INTERNAL;
  }
}
