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

    const accessKey = this.config.get<string>('SENDCHAMP_ACCESS_KEY');
    const senderName = this.config.get<string>('SENDCHAMP_SENDER_NAME');
    const baseUrl = this.config.get<string>(
      'SENDCHAMP_BASE_URL',
      'https://api.sendchamp.com/api/v1',
    );
    const route = this.config.get<string>('SENDCHAMP_SMS_ROUTE', 'non_dnd');
    const to = input.to.replace(/^\+/, '');
    const url = `${baseUrl.replace(/\/+$/, '')}/sms/send`;

    this.logger.log(`Sending SMS via Sendchamp: destination=${toMasked} route=${route}`);

    const response = await fetch(url, {
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
