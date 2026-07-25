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
 * SMTP email channel. Provider details remain behind the notification channel port.
 */
@Injectable()
export class EmailChannel implements NotificationChannelPort {
  private readonly logger = new Logger(EmailChannel.name);
  private readonly transporter?: Transporter;
  private readonly resendApiKey?: string;

  constructor(private readonly config: ConfigService) {
    this.resendApiKey = this.config.get<string>('RESEND_API_KEY');
    if (this.resendApiKey) return;

    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST'),
      port: this.config.get<number>('SMTP_PORT', 587),
      secure: this.config.get<boolean>('SMTP_SECURE', false),
      requireTLS: this.config.get<boolean>('SMTP_REQUIRE_TLS', false),
      tls: {
        rejectUnauthorized: this.config.get<boolean>('SMTP_TLS_REJECT_UNAUTHORIZED', true),
      },
      ...(user && pass ? { auth: { user, pass } } : {}),
    });
  }

  async send(input: ChannelSendInput): Promise<ChannelSendResult> {
    if (this.resendApiKey) return this.sendWithResend(input);

    const from = this.config.getOrThrow<string>('SMTP_FROM');
    const toMasked = maskDestination(input.to);

    try {
      const result = await this.transporter!.sendMail({
        from,
        to: input.to,
        subject: input.subject,
        text: input.text,
      });
      const providerRef = result.messageId;
      this.logger.log(
        `Email delivered: destination=${toMasked} provider=smtp providerRef=${providerRef}`,
      );
      return { providerRef };
    } catch (err) {
      const cause = err as NodeJS.ErrnoException & { responseCode?: number };
      const retryable = !cause.responseCode || cause.responseCode < 500;
      this.logger.error(
        `Email delivery failed: destination=${toMasked} provider=smtp code=${cause.code ?? cause.responseCode ?? 'unknown'} message=${cause.message}`,
      );
      throw new NotificationDeliveryError(cause.message || 'SMTP delivery failed', retryable);
    }
  }

  private async sendWithResend(input: ChannelSendInput): Promise<ChannelSendResult> {
    const fromEmail = this.config.getOrThrow<string>('RESEND_FROM_EMAIL');
    const fromName = this.config.getOrThrow<string>('RESEND_FROM_NAME');
    const toMasked = maskDestination(input.to);

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.resendApiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: `${fromName} <${fromEmail}>`,
          to: [input.to],
          subject: input.subject,
          text: input.text,
        }),
      });
      const result = (await response.json()) as { id?: string; message?: string };
      if (!response.ok || !result.id) {
        throw Object.assign(new Error(result.message || 'Resend delivery failed'), {
          responseCode: response.status,
        });
      }

      this.logger.log(
        `Email delivered: destination=${toMasked} provider=resend providerRef=${result.id}`,
      );
      return { providerRef: result.id };
    } catch (err) {
      const cause = err as Error & { responseCode?: number };
      const retryable =
        !cause.responseCode || cause.responseCode === 429 || cause.responseCode >= 500;
      this.logger.error(
        `Email delivery failed: destination=${toMasked} provider=resend code=${cause.responseCode ?? 'network'} message=${cause.message}`,
      );
      throw new NotificationDeliveryError(cause.message || 'Resend delivery failed', retryable);
    }
  }
}
