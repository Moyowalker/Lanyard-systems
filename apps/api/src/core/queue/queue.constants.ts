/** BullMQ queue names. */
export const PRESCRIPTION_AV_QUEUE = 'prescription-av';
export const NOTIFICATION_QUEUE = 'notifications';

export interface AvScanJobData {
  prescriptionId: string;
}

export interface NotificationJobData {
  notificationId?: string;
  direct?: {
    channel: 'sms' | 'email';
    to: string;
    subject: string;
    text: string;
  };
}
