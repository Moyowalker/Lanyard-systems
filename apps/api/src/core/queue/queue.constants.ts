import { NotificationChannel } from '@lanyard/contracts';

/** BullMQ queue names. */
export const PRESCRIPTION_AV_QUEUE = 'prescription-av';
export const NOTIFICATION_QUEUE = 'notifications';
export const PAYMENT_RECONCILE_QUEUE = 'payment-reconcile';

export interface AvScanJobData {
  prescriptionId: string;
}

export interface NotificationJobData {
  notificationId?: string;
  direct?: {
    channel: NotificationChannel;
    to: string;
    subject: string;
    text: string;
  };
}
