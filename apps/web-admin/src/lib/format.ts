export function formatKobo(kobo?: number, currency = 'NGN'): string {
  if (kobo == null) return '—';
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency }).format(kobo / 100);
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
  CREATED: 'Created',
  AWAITING_RX_VERIFICATION: 'Awaiting Rx verification',
  RX_VERIFIED: 'Rx verified',
  RX_REJECTED: 'Rx rejected',
  AWAITING_PAYMENT: 'Awaiting payment',
  PAYMENT_FAILED: 'Payment failed',
  PAID: 'Paid',
  STOCK_HOLD: 'Stock hold',
  FULFILLING: 'Fulfilling',
  READY_FOR_PICKUP: 'Ready for pickup',
  OUT_FOR_DELIVERY: 'Out for delivery',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};

export const label = (s: string): string => ORDER_STATUS_LABEL[s] ?? s;

export type Tone = 'success' | 'warn' | 'danger' | 'info' | 'neutral';

/** Map an order status to a badge tone. */
export const ORDER_STATUS_TONE: Record<string, Tone> = {
  CREATED: 'neutral',
  AWAITING_RX_VERIFICATION: 'warn',
  RX_VERIFIED: 'info',
  RX_REJECTED: 'danger',
  AWAITING_PAYMENT: 'warn',
  PAYMENT_FAILED: 'danger',
  PAID: 'info',
  STOCK_HOLD: 'danger',
  FULFILLING: 'info',
  READY_FOR_PICKUP: 'info',
  OUT_FOR_DELIVERY: 'info',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
  REFUNDED: 'neutral',
};

export const statusTone = (s: string): Tone => ORDER_STATUS_TONE[s] ?? 'neutral';

/** Map a prescription status to a badge tone. */
export const RX_STATUS_TONE: Record<string, Tone> = {
  pending: 'warn',
  under_review: 'info',
  verified: 'success',
  rejected: 'danger',
};

export const rxTone = (s: string): Tone => RX_STATUS_TONE[s] ?? 'neutral';

/** Full timestamp, e.g. "07 Jun 2026, 14:32". */
export function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Short relative time, e.g. "3m ago", "2h ago", "Apr 3". */
export function timeAgo(iso?: string): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(t).toLocaleDateString('en-NG', { month: 'short', day: 'numeric' });
}

/** Valid next transitions a staff member can drive from a given status. */
export const NEXT_ACTIONS: Record<string, string[]> = {
  PAID: ['FULFILLING'],
  STOCK_HOLD: ['FULFILLING', 'CANCELLED'],
  FULFILLING: ['READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'CANCELLED'],
  READY_FOR_PICKUP: ['COMPLETED', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['COMPLETED', 'CANCELLED'],
  AWAITING_PAYMENT: ['CANCELLED'],
};
