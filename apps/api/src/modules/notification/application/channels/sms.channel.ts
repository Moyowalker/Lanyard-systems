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
 * remain testable without a live provider. Production uses a real Termii HTTP send.
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

    const apiKey = this.config.get<string>('TERMII_API_KEY');
    const senderId = this.config.get<string>('TERMII_SENDER_ID');
    const baseUrl = this.config.get<string>('TERMII_BASE_URL', 'https://api.ng.termii.com');
    const channel = this.config.get<string>('TERMII_SMS_CHANNEL', 'generic');

    const response = await fetch(`${baseUrl}/api/sms/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        to: input.to,
        from: senderId,
        sms: input.text,
        type: 'plain',
        channel,
      }),
    });

    const body = (await response.json().catch(() => null)) as {
      code?: string;
      message_id?: string;
      message?: string;
      balance?: string;
    } | null;

    if (!response.ok) {
      const message = body?.message || `SMS provider request failed with status ${response.status}`;
      this.logger.error(
        `SMS delivery failed: destination=${toMasked} status=${response.status} message=${message}`,
      );
      throw new NotificationDeliveryError(message, response.status >= 500);
    }

    if (body?.code && body.code !== 'ok') {
      const message = body.message || 'SMS provider rejected the message';
      this.logger.warn(`SMS provider rejected delivery: destination=${toMasked} code=${body.code}`);
      throw new NotificationDeliveryError(message, false);
    }

    const providerRef = body?.message_id || `termii_${randomUUID()}`;
    this.logger.log(`SMS delivered: destination=${toMasked} providerRef=${providerRef}`);
    return { providerRef };
  }
}
