import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';

import {
  ChannelSendInput,
  ChannelSendResult,
  NotificationChannelPort,
  NotificationDeliveryError,
  maskDestination,
} from './channel.types';

/**
 * SMTP email channel using nodemailer. Supports authenticated and TLS relays in
 * production, with local Mailpit defaults in development.
 */
@Injectable()
export class EmailChannel implements NotificationChannelPort {
  private readonly logger = new Logger(EmailChannel.name);
  private readonly transport: Transporter;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST', 'localhost');
    const port = this.config.get<number>('SMTP_PORT', 1025);
    const secure = this.config.get<boolean>('SMTP_SECURE', false);
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');

    this.transport = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
      requireTLS: this.config.get<boolean>('SMTP_REQUIRE_TLS', false),
      tls: { rejectUnauthorized: this.config.get<boolean>('SMTP_TLS_REJECT_UNAUTHORIZED', true) },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
    });
  }

  async send(input: ChannelSendInput): Promise<ChannelSendResult> {
    const from = this.config.get<string>('SMTP_FROM', 'no-reply@lanyard.test');
    const messageId = `${randomUUID()}@lanyard`;
    const toMasked = maskDestination(input.to);

    try {
      const info = await this.transport.sendMail({
        from: `Lanyard Pharmacy <${from}>`,
        to: input.to,
        subject: input.subject,
        text: input.text,
        messageId,
      });
      const providerRef = info.messageId || messageId;
      this.logger.log(`Email delivered: destination=${toMasked} providerRef=${providerRef}`);
      return { providerRef };
    } catch (err) {
      const cause = err as NodeJS.ErrnoException & { responseCode?: number; code?: string };
      const retryable =
        (typeof cause.responseCode === 'number' &&
          cause.responseCode >= 400 &&
          cause.responseCode < 500) ||
        cause.code === 'ETIMEDOUT' ||
        cause.code === 'ECONNRESET' ||
        cause.code === 'ECONNREFUSED';
      this.logger.error(
        `Email delivery failed: destination=${toMasked} code=${cause.code ?? 'unknown'} responseCode=${cause.responseCode ?? 'n/a'} message=${cause.message}`,
      );
      throw new NotificationDeliveryError(cause.message || 'SMTP delivery failed', retryable);
    }
  }
}
