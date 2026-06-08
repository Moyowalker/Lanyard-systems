import { NotificationChannel, NotificationStatus } from '@lanyard/contracts';
import { Job } from 'bullmq';

import { NotificationProcessor } from './notification.processor';
import { NotificationDeliveryError } from '../application/channels/channel.types';

describe('NotificationProcessor', () => {
  const findById = jest.fn();
  const findByIdLean = jest.fn();
  const notificationModel = { findById };
  const customerModel = { findById: jest.fn(() => ({ lean: findByIdLean })) };
  const email = { send: jest.fn() };
  const sms = { send: jest.fn() };

  let processor: NotificationProcessor;

  beforeEach(() => {
    findById.mockReset();
    findByIdLean.mockReset();
    email.send.mockReset();
    sms.send.mockReset();
    processor = new NotificationProcessor(
      notificationModel as never,
      customerModel as never,
      email as never,
      sms as never,
    );
  });

  it('processes direct job successfully', async () => {
    sms.send.mockResolvedValue({ providerRef: 'sms-1' });

    await processor.process({
      data: {
        direct: {
          channel: NotificationChannel.SMS,
          to: '+2348000000001',
          subject: 'OTP',
          text: '123456',
        },
      },
    } as Job);

    expect(sms.send).toHaveBeenCalledWith({
      to: '+2348000000001',
      subject: 'OTP',
      text: '123456',
    });
  });

  it('drops direct job for non-retryable delivery error', async () => {
    sms.send.mockRejectedValue(new NotificationDeliveryError('invalid destination', false));

    await expect(
      processor.process({
        data: {
          direct: {
            channel: NotificationChannel.SMS,
            to: '+2348000000001',
            subject: 'OTP',
            text: '123456',
          },
        },
      } as Job),
    ).resolves.toBeUndefined();
  });

  it('rethrows direct job retryable errors for queue backoff', async () => {
    sms.send.mockRejectedValue(new NotificationDeliveryError('gateway timeout', true));

    await expect(
      processor.process({
        data: {
          direct: {
            channel: NotificationChannel.SMS,
            to: '+2348000000001',
            subject: 'OTP',
            text: '123456',
          },
        },
      } as Job),
    ).rejects.toThrow('gateway timeout');
  });

  it('marks stored notification as sent', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const notification = {
      _id: 'n1',
      recipientId: 'c1',
      recipientType: 'customer',
      channel: NotificationChannel.EMAIL,
      template: 'order.paid',
      payload: { orderNo: 'ORD-001', totalKobo: 123400 },
      status: NotificationStatus.QUEUED,
      save,
    };

    findById.mockResolvedValue(notification);
    findByIdLean.mockResolvedValue({ email: 'customer@example.com', firstName: 'Ada' });
    email.send.mockResolvedValue({ providerRef: 'mail-1' });

    await processor.process({ data: { notificationId: 'n1' } } as Job);

    expect(notification.status).toBe(NotificationStatus.SENT);
    expect((notification as { providerRef?: string }).providerRef).toBe('mail-1');
    expect(save).toHaveBeenCalled();
  });

  it('records failure and does not rethrow terminal errors for stored notifications', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const notification = {
      _id: 'n2',
      recipientId: 'c2',
      recipientType: 'customer',
      channel: NotificationChannel.EMAIL,
      template: 'order.paid',
      payload: { orderNo: 'ORD-002', totalKobo: 123400 },
      status: NotificationStatus.QUEUED,
      attempts: 0,
      save,
    };

    findById.mockResolvedValue(notification);
    findByIdLean.mockResolvedValue({ email: 'customer@example.com', firstName: 'Ada' });
    email.send.mockRejectedValue(new NotificationDeliveryError('mailbox unavailable', false));

    await expect(processor.process({ data: { notificationId: 'n2' } } as Job)).resolves.toBeUndefined();
    expect(notification.status).toBe(NotificationStatus.FAILED);
    expect(notification.attempts).toBe(1);
    expect(save).toHaveBeenCalled();
  });

  it('records failure and rethrows retryable errors for stored notifications', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const notification = {
      _id: 'n3',
      recipientId: 'c3',
      recipientType: 'customer',
      channel: NotificationChannel.EMAIL,
      template: 'order.paid',
      payload: { orderNo: 'ORD-003', totalKobo: 123400 },
      status: NotificationStatus.QUEUED,
      attempts: 0,
      save,
    };

    findById.mockResolvedValue(notification);
    findByIdLean.mockResolvedValue({ email: 'customer@example.com', firstName: 'Ada' });
    email.send.mockRejectedValue(new NotificationDeliveryError('smtp timeout', true));

    await expect(processor.process({ data: { notificationId: 'n3' } } as Job)).rejects.toThrow(
      'smtp timeout',
    );
    expect(notification.status).toBe(NotificationStatus.FAILED);
    expect(notification.attempts).toBe(1);
    expect(save).toHaveBeenCalled();
  });
});
