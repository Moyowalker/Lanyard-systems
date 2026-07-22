import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

import {
  ChannelSendInput,
  ChannelSendResult,
  NotificationChannelPort,
  NotificationDeliveryError,
  maskDestination,
} from './channel.types';

/**
 * Resend email channel. The verified sender domain is configured outside the app,
 * while this adapter keeps provider details behind the notification channel port.
 */
@Injectable()
export class EmailChannel implements NotificationChannelPort {
  private readonly logger = new Logger(EmailChannel.name);
  private readonly resend: Resend;

  constructor(private readonly config: ConfigService) {
    this.resend = new Resend(this.config.get<string>('RESEND_API_KEY'));
  }

  async send(input: ChannelSendInput): Promise<ChannelSendResult> {
    const fromEmail = this.config.get<string>('RESEND_FROM_EMAIL', 'onboarding@resend.dev');
    const fromName = this.config.get<string>('RESEND_FROM_NAME', 'Lanyard Pharmacy');
    const toMasked = maskDestination(input.to);

    try {
      const { data, error } = await this.resend.emails.send({
        from: `${fromName} <${fromEmail}>`,
        to: input.to,
        subject: input.subject,
        text: input.text,
      });

      if (error) {
        const retryable = ![
          'invalid_api_key',
          'validation_error',
          'restricted_api_key',
          'not_found',
          'method_not_allowed',
        ].includes(error.name);
        this.logger.error(
          `Email delivery failed: destination=${toMasked} provider=resend code=${error.name} message=${error.message}`,
        );
        throw new NotificationDeliveryError(error.message, retryable);
      }

      const providerRef = data?.id;
      this.logger.log(`Email delivered: destination=${toMasked} providerRef=${providerRef}`);
      return { providerRef };
    } catch (err) {
      if (err instanceof NotificationDeliveryError) throw err;
      const cause = err as NodeJS.ErrnoException;
      this.logger.error(
        `Email delivery failed: destination=${toMasked} provider=resend code=${cause.code ?? 'unknown'} message=${cause.message}`,
      );
      throw new NotificationDeliveryError(cause.message || 'Resend delivery failed', true);
    }
  }
}
