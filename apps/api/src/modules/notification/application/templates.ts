function naira(kobo?: unknown): string {
  if (typeof kobo !== 'number') return '';
  return `₦${(kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
}

export interface RenderedMessage {
  subject: string;
  text: string;
}

/** Renders a notification template. Plain-text for now; HTML variants come with the design system. */
export function renderTemplate(
  template: string,
  payload: Record<string, unknown>,
  name?: string,
): RenderedMessage {
  const hi = `Hi ${name ?? 'there'},`;
  const sign = '\n\n— Lanyard Pharmacy';
  switch (template) {
    case 'otp.login':
      return {
        subject: 'Your Lanyard login code',
        text: `${hi}\n\nUse ${payload.code} to complete your login. This code expires in ${payload.ttlMinutes ?? 5} minutes.${sign}`,
      };
    case 'otp.verify':
      return {
        subject: 'Verify your Lanyard account',
        text: `${hi}\n\nUse ${payload.code} to verify your account. This code expires in ${payload.ttlMinutes ?? 5} minutes.${sign}`,
      };
    case 'otp.reset':
      return {
        subject: 'Your Lanyard reset code',
        text: `${hi}\n\nUse ${payload.code} to continue your reset request. This code expires in ${payload.ttlMinutes ?? 5} minutes.${sign}`,
      };
    case 'order.paid':
      return {
        subject: `Your Lanyard order ${payload.orderNo} is confirmed`,
        text: `${hi}\n\nWe've received your payment of ${naira(payload.totalKobo)} for order ${payload.orderNo}. We'll notify you as it progresses.${sign}`,
      };
    case 'order.completed':
      return {
        subject: `Order ${payload.orderNo} is complete`,
        text: `${hi}\n\nYour order ${payload.orderNo} has been ${
          payload.fulfillment === 'delivery' ? 'delivered' : 'completed and is ready'
        }. Thank you for choosing Lanyard.${sign}`,
      };
    case 'rx.verified':
      return {
        subject: 'Your prescription has been verified',
        text: `${hi}\n\nGood news — a pharmacist has verified your prescription. Your order can now proceed.${sign}`,
      };
    case 'rx.rejected':
      return {
        subject: 'Action needed on your prescription',
        text: `${hi}\n\nA pharmacist was unable to verify your recent prescription. Please contact us or upload a clearer copy.${sign}`,
      };
    default:
      return {
        subject: 'Lanyard Pharmacy',
        text: `${hi}\n\nThere's an update on your order.${sign}`,
      };
  }
}
