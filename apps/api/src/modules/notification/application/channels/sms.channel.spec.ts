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

    const result = await channel.send({ to: '+2347088167402', subject: 'OTP', text: '123456' });

    expect(result.providerRef).toMatch(/^sms_/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends through Sendchamp in production', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'SMS sent successfully', data: { sms_uid: 'sendchamp-123' } }),
    });

    const channel = new SmsChannel(
      new ConfigService({
        NODE_ENV: 'production',
        SENDCHAMP_ACCESS_KEY: 'sendchamp-key',
        SENDCHAMP_SENDER_NAME: 'Lanyard',
        SENDCHAMP_BASE_URL: 'https://api.sendchamp.com/api/v1',
        SENDCHAMP_SMS_ROUTE: 'non_dnd',
      }),
    );

    const result = await channel.send({
      to: '+2347088167402',
      subject: 'OTP',
      text: 'Use 123456 to sign in',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.sendchamp.com/api/v1/sms/send',
      expect.objectContaining({
        body: JSON.stringify({
          to: '2347088167402',
          message: 'Use 123456 to sign in',
          sender_name: 'Lanyard',
          route: 'non_dnd',
        }),
        headers: expect.objectContaining({ Authorization: 'Bearer sendchamp-key' }),
        method: 'POST',
      }),
    );
    expect(result).toEqual({ providerRef: 'sendchamp-123' });
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
        SENDCHAMP_ACCESS_KEY: 'sendchamp-key',
        SENDCHAMP_SENDER_NAME: 'Lanyard',
      }),
    );

    await expect(
      channel.send({ to: '+2347088167402', subject: 'OTP', text: 'Use 123456 to sign in' }),
    ).rejects.toMatchObject({ retryable: true });
  });

  it('preserves nested network error codes for production diagnostics', async () => {
    const ipv6Error = Object.assign(new Error('connect ENETUNREACH'), { code: 'ENETUNREACH' });
    const fetchError = Object.assign(new TypeError('fetch failed'), {
      cause: new AggregateError([ipv6Error]),
    });
    fetchMock.mockRejectedValue(fetchError);

    const channel = new SmsChannel(
      new ConfigService({
        NODE_ENV: 'production',
        SENDCHAMP_ACCESS_KEY: 'sendchamp-key',
        SENDCHAMP_SENDER_NAME: 'Lanyard',
      }),
    );

    await expect(
      channel.send({ to: '+2347088167402', subject: 'OTP', text: 'Use 123456 to sign in' }),
    ).rejects.toMatchObject({
      retryable: true,
      message: expect.stringContaining('ENETUNREACH'),
    });
  });
});
