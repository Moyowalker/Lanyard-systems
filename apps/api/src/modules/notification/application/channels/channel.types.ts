export interface ChannelSendInput {
  to: string;
  subject: string;
  text: string;
}

export interface ChannelSendResult {
  providerRef?: string;
}

/**
 * Transport-level error with retry hint. Notification workers rethrow retryable
 * errors to let BullMQ backoff/retry; terminal errors are recorded and swallowed.
 */
export class NotificationDeliveryError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'NotificationDeliveryError';
  }
}

/** Masks a destination for logs (never log full phone/email). */
export function maskDestination(value: string): string {
  if (!value) return 'unknown';
  if (value.includes('@')) {
    const [local, domain] = value.split('@');
    const localPrefix = local.slice(0, 2);
    return `${localPrefix}***@${domain}`;
  }
  const digits = value.replace(/\D/g, '');
  const suffix = digits.slice(-2);
  return `***${suffix}`;
}

/** A delivery transport (email, SMS, …). Adapters are swappable per environment. */
export interface NotificationChannelPort {
  send(input: ChannelSendInput): Promise<ChannelSendResult>;
}
