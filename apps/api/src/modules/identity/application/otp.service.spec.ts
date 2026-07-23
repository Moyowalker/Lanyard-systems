import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { ErrorCode, NotificationChannel, OtpChannel, OtpPurpose } from '@lanyard/contracts';

import { OtpService } from './otp.service';
import { NotificationService } from '../../notification/application/notification.service';
import { DomainError } from '../../../core/errors/domain-error';

describe('OtpService', () => {
  const create = jest.fn();
  const deleteOne = jest.fn();
  const otpModel = { create, deleteOne };
  const notifications = { notifyOtp: jest.fn() } as unknown as NotificationService;

  beforeEach(() => {
    create.mockReset();
    deleteOne.mockReset();
    (notifications.notifyOtp as jest.Mock).mockReset();
  });

  it('requests OTP delivery and returns devCode outside production', async () => {
    create.mockResolvedValue({ _id: new Types.ObjectId() });
    (notifications.notifyOtp as jest.Mock).mockResolvedValue(undefined);

    const service = new OtpService(
      otpModel as never,
      new ConfigService({ NODE_ENV: 'development', OTP_TTL_SECONDS: 300, OTP_MAX_ATTEMPTS: 5 }),
      notifications,
    );

    const result = await service.issue(OtpChannel.SMS, '+2347088167402', OtpPurpose.LOGIN);

    expect(notifications.notifyOtp).toHaveBeenCalledWith(
      '+2347088167402',
      OtpPurpose.LOGIN,
      expect.any(String),
      300,
      NotificationChannel.SMS,
    );
    expect(result.challengeId).toBeDefined();
    expect(result.devCode).toMatch(/^\d{6}$/);
  });

  it('delivers email-channel OTP over the email notification channel', async () => {
    create.mockResolvedValue({ _id: new Types.ObjectId() });
    (notifications.notifyOtp as jest.Mock).mockResolvedValue(undefined);

    const service = new OtpService(
      otpModel as never,
      new ConfigService({ NODE_ENV: 'development', OTP_TTL_SECONDS: 300, OTP_MAX_ATTEMPTS: 5 }),
      notifications,
    );

    await service.issue(OtpChannel.EMAIL, 'patient@example.com', OtpPurpose.VERIFY);

    expect(notifications.notifyOtp).toHaveBeenCalledWith(
      'patient@example.com',
      OtpPurpose.VERIFY,
      expect.any(String),
      300,
      NotificationChannel.EMAIL,
    );
  });

  it('removes the challenge and throws when OTP delivery is rejected', async () => {
    const id = new Types.ObjectId();
    create.mockResolvedValue({ _id: id });
    (notifications.notifyOtp as jest.Mock).mockRejectedValue(new Error('queue unavailable'));

    const service = new OtpService(
      otpModel as never,
      new ConfigService({ NODE_ENV: 'production', OTP_TTL_SECONDS: 300, OTP_MAX_ATTEMPTS: 5 }),
      notifications,
    );

    await expect(
      service.issue(OtpChannel.SMS, '+2347088167402', OtpPurpose.LOGIN),
    ).rejects.toMatchObject<Partial<DomainError>>({ code: ErrorCode.INTERNAL });

    expect(deleteOne).toHaveBeenCalledWith({ _id: id });
  });
});
