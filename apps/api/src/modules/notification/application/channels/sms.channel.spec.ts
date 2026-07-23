import { EventEmitter } from 'node:events';
import { request as httpsRequest } from 'node:https';
import { ConfigService } from '@nestjs/config';

import { SmsChannel } from './sms.channel';

jest.mock('node:https', () => ({ request: jest.fn() }));

describe('SmsChannel', () => {
  const requestMock = httpsRequest as jest.MockedFunction<typeof httpsRequest>;

  function respond(status: number, body: unknown) {
    requestMock.mockImplementation((_url, _options, callback) => {
      const request = new EventEmitter() as EventEmitter & {
        end: jest.Mock;
        destroy: jest.Mock;
      };
      request.destroy = jest.fn((error?: Error) => {
        if (error) request.emit('error', error);
      });
      request.end = jest.fn(() => {
        const response = new EventEmitter() as EventEmitter & { statusCode: number };
        response.statusCode = status;
        callback!(response as never);
        response.emit('data', Buffer.from(JSON.stringify(body)));
        response.emit('end');
      });
      return request as never;
    });
  }

  beforeEach(() => {
    requestMock.mockReset();
  });

  it('returns a synthetic reference outside production', async () => {
    const channel = new SmsChannel(
      new ConfigService({
        NODE_ENV: 'development',
      }),
    );

    const result = await channel.send({ to: '+2347088167402', subject: 'OTP', text: '123456' });

    expect(result.providerRef).toMatch(/^sms_/);
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('sends through Sendchamp in production', async () => {
    respond(200, { message: 'SMS sent successfully', data: { sms_uid: 'sendchamp-123' } });

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

    expect(requestMock).toHaveBeenCalledWith(
      'https://api.sendchamp.com/api/v1/sms/send',
      expect.objectContaining({
        family: 4,
        headers: expect.objectContaining({ Authorization: 'Bearer sendchamp-key' }),
        method: 'POST',
        timeout: 15000,
      }),
      expect.any(Function),
    );
    expect(result).toEqual({ providerRef: 'sendchamp-123' });
  });

  it('marks upstream 5xx provider errors as retryable', async () => {
    respond(503, { message: 'Service unavailable' });

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
    const timeoutError = Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' });
    const aggregateError = Object.assign(new Error(''), {
      errors: [timeoutError],
    });
    requestMock.mockImplementation(() => {
      const request = new EventEmitter() as EventEmitter & { end: jest.Mock; destroy: jest.Mock };
      request.destroy = jest.fn();
      request.end = jest.fn(() => request.emit('error', aggregateError));
      return request as never;
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
    ).rejects.toMatchObject({
      retryable: true,
      message: expect.stringContaining('ETIMEDOUT'),
    });
  });
});
