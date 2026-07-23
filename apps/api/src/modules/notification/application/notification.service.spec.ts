import { NotificationChannel, OtpPurpose } from '@lanyard/contracts';

import { NotificationService } from './notification.service';

describe('NotificationService.notifyOtp', () => {
  const queue = { add: jest.fn() };
  const email = { send: jest.fn() };
  const sms = { send: jest.fn() };

  const service = new NotificationService(
    {} as never,
    {} as never,
    {} as never,
    queue as never,
    email as never,
    sms as never,
  );

  beforeEach(() => {
    queue.add.mockReset();
    email.send.mockReset();
    sms.send.mockReset();
    email.send.mockResolvedValue({ providerRef: 'email-1' });
    sms.send.mockResolvedValue({ providerRef: 'sms-1' });
  });

  it('waits for SMS provider acceptance for phone OTPs', async () => {
    await service.notifyOtp(
      '+2348161739240',
      OtpPurpose.LOGIN,
      '123456',
      300,
      NotificationChannel.SMS,
    );

    expect(sms.send).toHaveBeenCalledWith({
      to: '+2348161739240',
      subject: expect.any(String),
      text: expect.stringContaining('123456'),
    });
    expect(email.send).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('waits for email provider acceptance for email OTPs', async () => {
    await service.notifyOtp(
      'customer@example.com',
      OtpPurpose.VERIFY,
      '654321',
      300,
      NotificationChannel.EMAIL,
    );

    expect(email.send).toHaveBeenCalledWith({
      to: 'customer@example.com',
      subject: expect.any(String),
      text: expect.stringContaining('654321'),
    });
    expect(sms.send).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
});
