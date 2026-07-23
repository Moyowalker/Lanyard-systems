import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { request as httpsRequest } from 'node:https';

import {
  ChannelSendInput,
  ChannelSendResult,
  NotificationChannelPort,
  NotificationDeliveryError,
  maskDestination,
} from './channel.types';

function errorMessageWithCause(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const code = (error as NodeJS.ErrnoException).code;
  const ownMessage = error.message || code || error.name;
  const cause = (error as Error & { cause?: unknown }).cause;
  const aggregateErrors = (error as Error & { errors?: unknown[] }).errors;
  if (Array.isArray(aggregateErrors)) {
    const details = aggregateErrors.map(errorMessageWithCause).filter(Boolean).join('; ');
    return details ? `${ownMessage}: ${details}` : ownMessage;
  }
  if (!cause) return code && !ownMessage.includes(code) ? `${ownMessage} (${code})` : ownMessage;

  const causeErrors = (cause as { errors?: unknown[] } | null)?.errors;
  if (Array.isArray(causeErrors)) {
    const details = causeErrors.map(errorMessageWithCause).filter(Boolean).join('; ');
    return details ? `${ownMessage}: ${details}` : ownMessage;
  }
  if (cause instanceof Error) return `${ownMessage}: ${errorMessageWithCause(cause)}`;
  if (typeof cause === 'object' && cause !== null) {
    const details = cause as { code?: string; message?: string };
    return `${ownMessage}: ${details.code ?? details.message ?? JSON.stringify(details)}`;
  }

  return `${ownMessage}: ${String(cause)}`;
}

function postJsonOverIpv4(
  url: string,
  headers: Record<string, string>,
  body: Record<string, string>,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body));
    const request = httpsRequest(
      url,
      {
        method: 'POST',
        family: 4,
        timeout: 15_000,
        headers: {
          ...headers,
          'Content-Length': String(payload.byteLength),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)));
        response.on('error', reject);
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let responseBody: unknown = null;
          try {
            responseBody = text ? JSON.parse(text) : null;
          } catch {
            responseBody = null;
          }
          resolve({ status: response.statusCode ?? 0, body: responseBody });
        });
      },
    );
    request.on('timeout', () => {
      request.destroy(
        Object.assign(new Error('Sendchamp connection timed out'), { code: 'ETIMEDOUT' }),
      );
    });
    request.on('error', reject);
    request.end(payload);
  });
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
    const baseUrl = this.config
      .get<string>('SENDCHAMP_BASE_URL', 'https://api.sendchamp.com/api/v1')
      .trim();
    const route = this.config.get<string>('SENDCHAMP_SMS_ROUTE', 'non_dnd').trim();
    if (!accessKey || !senderName) {
      throw new NotificationDeliveryError('Sendchamp credentials are not configured', false);
    }
    const to = input.to.replace(/^\+/, '');
    const url = `${baseUrl.replace(/\/+$/, '')}/sms/send`;

    this.logger.log(
      `Sending SMS via Sendchamp: destination=${toMasked} route=${route} host=${new URL(url).host}`,
    );

    let response: { status: number; body: unknown };
    try {
      response = await postJsonOverIpv4(
        url,
        {
          Accept: 'application/json',
          Authorization: `Bearer ${accessKey}`,
          'Content-Type': 'application/json',
        },
        {
          to,
          message: input.text,
          sender_name: senderName,
          route,
        },
      );
    } catch (err) {
      const message = errorMessageWithCause(err);
      this.logger.error(`SMS provider network failure: destination=${toMasked} message=${message}`);
      throw new NotificationDeliveryError(message, true);
    }

    const body = response.body as {
      message?: string;
      data?: {
        id?: string;
        reference?: string;
        sms_uid?: string;
        uid?: string;
      };
    } | null;

    if (response.status < 200 || response.status >= 300) {
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
