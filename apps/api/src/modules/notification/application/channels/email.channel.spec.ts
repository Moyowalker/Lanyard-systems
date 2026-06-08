import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

import { EmailChannel } from './email.channel';

describe('EmailChannel', () => {
  const sendMail = jest.fn();
  const createTransport = jest.spyOn(nodemailer, 'createTransport');

  beforeEach(() => {
    sendMail.mockReset();
    createTransport.mockReset();
    createTransport.mockReturnValue({ sendMail } as never);
  });

  it('sends email and returns provider reference', async () => {
    sendMail.mockResolvedValue({ messageId: 'smtp-123' });

    const channel = new EmailChannel(
      new ConfigService({
        SMTP_HOST: 'localhost',
        SMTP_PORT: 1025,
        SMTP_FROM: 'no-reply@lanyard.test',
      }),
    );

    const result = await channel.send({
      to: 'customer@example.com',
      subject: 'Order update',
      text: 'Your order is ready.',
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'customer@example.com', subject: 'Order update' }),
    );
    expect(result).toEqual({ providerRef: 'smtp-123' });
  });

  it('marks SMTP 5xx response errors as non-retryable', async () => {
    sendMail.mockRejectedValue({ message: 'Mailbox unavailable', responseCode: 550, code: 'EENVELOPE' });

    const channel = new EmailChannel(
      new ConfigService({
        SMTP_HOST: 'localhost',
        SMTP_PORT: 1025,
        SMTP_FROM: 'no-reply@lanyard.test',
      }),
    );

    await expect(
      channel.send({
        to: 'customer@example.com',
        subject: 'Order update',
        text: 'Your order is ready.',
      }),
    ).rejects.toMatchObject({ retryable: false });
  });

  it('marks SMTP timeout errors as retryable', async () => {
    sendMail.mockRejectedValue({ message: 'Connection timeout', code: 'ETIMEDOUT' });

    const channel = new EmailChannel(
      new ConfigService({
        SMTP_HOST: 'localhost',
        SMTP_PORT: 1025,
        SMTP_FROM: 'no-reply@lanyard.test',
      }),
    );

    await expect(
      channel.send({
        to: 'customer@example.com',
        subject: 'Order update',
        text: 'Your order is ready.',
      }),
    ).rejects.toMatchObject({ retryable: true });
  });
});
