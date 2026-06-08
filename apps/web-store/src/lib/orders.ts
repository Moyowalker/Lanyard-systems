/** Human labels for order statuses (mirrors the backend OrderStatus enum). */
export const ORDER_STATUS_LABEL: Record<string, string> = {
  CREATED: 'Created',
  AWAITING_RX_VERIFICATION: 'Awaiting pharmacist verification',
  RX_VERIFIED: 'Prescription verified',
  RX_REJECTED: 'Prescription rejected',
  AWAITING_PAYMENT: 'Awaiting payment',
  PAYMENT_FAILED: 'Payment failed',
  PAID: 'Paid',
  STOCK_HOLD: 'On hold (stock)',
  FULFILLING: 'Being prepared',
  READY_FOR_PICKUP: 'Ready for pickup',
  OUT_FOR_DELIVERY: 'Out for delivery',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};

export function statusLabel(status: string): string {
  return ORDER_STATUS_LABEL[status] ?? status;
}

export function statusTone(status: string): string {
  if (['COMPLETED', 'READY_FOR_PICKUP', 'PAID', 'RX_VERIFIED'].includes(status))
    return 'bg-brand-100 text-brand-800';
  if (['RX_REJECTED', 'PAYMENT_FAILED', 'CANCELLED'].includes(status))
    return 'bg-red-100 text-red-700';
  if (['REFUNDED', 'STOCK_HOLD'].includes(status)) return 'bg-amber-100 text-amber-800';
  return 'bg-gray-100 text-gray-700';
}
