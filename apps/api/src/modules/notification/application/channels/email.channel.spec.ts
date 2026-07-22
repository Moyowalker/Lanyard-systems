import { ConfigService } from '@nestjs/config';

import { EmailChannel } from './email.channel';

const mockSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}));

describe('EmailChannel', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it('sends email and returns provider reference', async () => {
    mockSend.mockResolvedValue({ data: { id: 'resend-123' }, error: null });

    const channel = new EmailChannel(
      new ConfigService({
        RESEND_API_KEY: 're_test_key',
        RESEND_FROM_EMAIL: 'notifications@lanyardpharmacy.com',
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
    expect(result).toEqual({ providerRef: 'resend-123' });
  });

  it('marks Resend validation errors as non-retryable', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: 'Invalid recipient' },
    });

    const channel = new EmailChannel(
      new ConfigService({
        RESEND_API_KEY: 're_test_key',
        RESEND_FROM_EMAIL: 'notifications@lanyardpharmacy.com',
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

  it('marks Resend rate-limit errors as retryable', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { name: 'rate_limit_exceeded', message: 'Too many requests' },
    });

    const channel = new EmailChannel(
      new ConfigService({
        RESEND_API_KEY: 're_test_key',
        RESEND_FROM_EMAIL: 'notifications@lanyardpharmacy.com',
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
