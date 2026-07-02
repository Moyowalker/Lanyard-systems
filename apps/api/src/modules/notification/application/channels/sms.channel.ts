import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

import {
  ChannelSendInput,
  ChannelSendResult,
  NotificationChannelPort,
  NotificationDeliveryError,
  maskDestination,
} from './channel.types';

function errorMessageWithCause(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const cause = (error as Error & { cause?: unknown }).cause;
  if (!cause) return error.message;

  if (cause instanceof Error) return `${error.message}: ${cause.message}`;
  if (typeof cause === 'object' && cause !== null) {
    const details = cause as { code?: string; message?: string };
    return `${error.message}: ${details.code ?? details.message ?? JSON.stringify(details)}`;
  }

  return `${error.message}: ${String(cause)}`;
}

/**
 * SMS transport. In non-production it logs and returns a synthetic ref so OTP flows
 * remain testable without a live provider. Production uses a real Sendchamp HTTP send.
 */
@Injectable()
export class SmsChannel implements NotificationChannelPort {
  private readonly logger = new Logger(SmsChannel.name);

  constructor(private readonly config: ConfigService) {}

  private get isProd(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  async send(input: ChannelSendInput): Promise<ChannelSendResult> {
    const toMasked = maskDestination(input.to);

    if (!this.isProd) {
      this.logger.log(`SMS accepted (dev-fallback): destination=${toMasked}`);
      return { providerRef: `sms_${randomUUID()}` };
    }

    const accessKey = this.config.get<string>('SENDCHAMP_ACCESS_KEY')?.trim();
    const senderName = this.config.get<string>('SENDCHAMP_SENDER_NAME')?.trim();
    const baseUrl = this.config.get<string>(
      'SENDCHAMP_BASE_URL',
      'https://api.sendchamp.com/api/v1',
    ).trim();
    const route = this.config.get<string>('SENDCHAMP_SMS_ROUTE', 'non_dnd').trim();
    const to = input.to.replace(/^\+/, '');
    const url = `${baseUrl.replace(/\/+$/, '')}/sms/send`;

    this.logger.log(
      `Sending SMS via Sendchamp: destination=${toMasked} route=${route} host=${new URL(url).host}`,
    );

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to,
          message: input.text,
          sender_name: senderName,
          route,
        }),
      });
    } catch (err) {
      const message = errorMessageWithCause(err);
      this.logger.error(`SMS provider network failure: destination=${toMasked} message=${message}`);
      throw new NotificationDeliveryError(message, true);
    }

    const body = (await response.json().catch(() => null)) as {
      message?: string;
      data?: {
        id?: string;
        reference?: string;
        sms_uid?: string;
        uid?: string;
      };
    } | null;

    if (!response.ok) {
      const message = body?.message || `SMS provider request failed with status ${response.status}`;
      this.logger.error(
        `SMS delivery failed: destination=${toMasked} status=${response.status} message=${message}`,
      );
      throw new NotificationDeliveryError(message, response.status >= 500);
    }

    const providerRef =
      body?.data?.sms_uid ||
      body?.data?.uid ||
      body?.data?.reference ||
      body?.data?.id ||
      `sendchamp_${randomUUID()}`;
    this.logger.log(`SMS delivered: destination=${toMasked} providerRef=${providerRef}`);
    return { providerRef };
  }
}
