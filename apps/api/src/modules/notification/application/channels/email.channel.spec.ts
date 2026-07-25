import { ConfigService } from '@nestjs/config';

import { EmailChannel } from './email.channel';

const mockSend = jest.fn();

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn(() => ({ sendMail: mockSend })) },
}));

describe('EmailChannel', () => {
  beforeEach(() => {
    mockSend.mockReset();
    jest.restoreAllMocks();
  });

  it('sends email through Resend when configured', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'resend-123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const channel = new EmailChannel(
      new ConfigService({
        RESEND_API_KEY: 're_test',
        RESEND_FROM_EMAIL: 'notifications@lanyardpharmacy.com',
        RESEND_FROM_NAME: 'Lanyard Pharmacy',
      }),
    );

    const result = await channel.send({
      to: 'customer@example.com',
      subject: 'Order update',
      text: 'Your order is ready.',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          from: 'Lanyard Pharmacy <notifications@lanyardpharmacy.com>',
          to: ['customer@example.com'],
          subject: 'Order update',
          text: 'Your order is ready.',
        }),
      }),
    );
    expect(result).toEqual({ providerRef: 'resend-123' });
  });

  it('sends email and returns provider reference', async () => {
    mockSend.mockResolvedValue({ messageId: 'smtp-123' });

    const channel = new EmailChannel(
      new ConfigService({
        SMTP_HOST: 'smtp.test.local',
        SMTP_FROM: 'Lanyard Pharmacy <notifications@lanyardpharmacy.com>',
      }),
    );

    const result = await channel.send({
      to: 'customer@example.com',
      subject: 'Order update',
      text: 'Your order is ready.',
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Lanyard Pharmacy <notifications@lanyardpharmacy.com>',
        to: 'customer@example.com',
        subject: 'Order update',
      }),
    );
    expect(result).toEqual({ providerRef: 'smtp-123' });
  });

  it('marks permanent SMTP errors as non-retryable', async () => {
    mockSend.mockRejectedValue(
      Object.assign(new Error('Invalid recipient'), { code: 'EENVELOPE', responseCode: 550 }),
    );

    const channel = new EmailChannel(
      new ConfigService({
        SMTP_HOST: 'smtp.test.local',
        SMTP_FROM: 'notifications@lanyardpharmacy.com',
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

  it('marks transient SMTP errors as retryable', async () => {
    mockSend.mockRejectedValue(
      Object.assign(new Error('Mailbox busy'), { code: 'EENVELOPE', responseCode: 450 }),
    );

    const channel = new EmailChannel(
      new ConfigService({
        SMTP_HOST: 'smtp.test.local',
        SMTP_FROM: 'notifications@lanyardpharmacy.com',
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
