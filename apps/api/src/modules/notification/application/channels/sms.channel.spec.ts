import { ConfigService } from '@nestjs/config';

import { SmsChannel } from './sms.channel';

describe('SmsChannel', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('returns a synthetic reference outside production', async () => {
    const channel = new SmsChannel(
      new ConfigService({
        NODE_ENV: 'development',
      }),
    );

    const result = await channel.send({ to: '+2348000000001', subject: 'OTP', text: '123456' });

    expect(result.providerRef).toMatch(/^sms_/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends through Termii in production', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'ok', message_id: 'termii-123' }),
    });

    const channel = new SmsChannel(
      new ConfigService({
        NODE_ENV: 'production',
        TERMII_API_KEY: 'termii-key',
        TERMII_SENDER_ID: 'Lanyard',
        TERMII_BASE_URL: 'https://api.ng.termii.com',
        TERMII_SMS_CHANNEL: 'generic',
      }),
    );

    const result = await channel.send({
      to: '+2348000000001',
      subject: 'OTP',
      text: 'Use 123456 to sign in',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.ng.termii.com/api/sms/send',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result).toEqual({ providerRef: 'termii-123' });
  });

  it('throws when the provider rejects the message', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ code: 'invalid', message: 'Sender blocked' }),
    });

    const channel = new SmsChannel(
      new ConfigService({
        NODE_ENV: 'production',
        TERMII_API_KEY: 'termii-key',
        TERMII_SENDER_ID: 'Lanyard',
      }),
    );

    await expect(
      channel.send({ to: '+2348000000001', subject: 'OTP', text: 'Use 123456 to sign in' }),
    ).rejects.toMatchObject({ retryable: false });
  });

  it('marks upstream 5xx provider errors as retryable', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ message: 'Service unavailable' }),
    });

    const channel = new SmsChannel(
      new ConfigService({
        NODE_ENV: 'production',
        TERMII_API_KEY: 'termii-key',
        TERMII_SENDER_ID: 'Lanyard',
      }),
    );

    await expect(
      channel.send({ to: '+2348000000001', subject: 'OTP', text: 'Use 123456 to sign in' }),
    ).rejects.toMatchObject({ retryable: true });
  });
});