import { ErrorCode, OrderStatus } from '@lanyard/contracts';
import { DomainError } from '../../../core/errors/domain-error';

/**
 * Allowed order status transitions (docs/architecture/03 §4). Illegal transitions throw.
 * Terminal states have no outgoing transitions.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.CREATED]: [OrderStatus.AWAITING_RX_VERIFICATION, OrderStatus.AWAITING_PAYMENT],
  [OrderStatus.AWAITING_RX_VERIFICATION]: [OrderStatus.RX_VERIFIED, OrderStatus.RX_REJECTED],
  [OrderStatus.RX_VERIFIED]: [OrderStatus.AWAITING_PAYMENT],
  [OrderStatus.AWAITING_PAYMENT]: [
    OrderStatus.PAID,
    OrderStatus.PAYMENT_FAILED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.PAYMENT_FAILED]: [OrderStatus.AWAITING_PAYMENT, OrderStatus.CANCELLED],
  [OrderStatus.PAID]: [
    OrderStatus.FULFILLING,
    OrderStatus.STOCK_HOLD,
    OrderStatus.CANCELLED,
    OrderStatus.REFUNDED,
  ],
  [OrderStatus.STOCK_HOLD]: [OrderStatus.FULFILLING, OrderStatus.CANCELLED, OrderStatus.REFUNDED],
  [OrderStatus.FULFILLING]: [
    OrderStatus.READY_FOR_PICKUP,
    OrderStatus.OUT_FOR_DELIVERY,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.READY_FOR_PICKUP]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.RX_REJECTED]: [],
  [OrderStatus.REFUNDED]: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new DomainError(ErrorCode.CONFLICT, `Illegal order transition: ${from} → ${to}`);
  }
}
