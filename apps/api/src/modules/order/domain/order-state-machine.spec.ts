import { ErrorCode, OrderStatus } from '@lanyard/contracts';

import { ORDER_TRANSITIONS, assertTransition, canTransition } from './order-state-machine';
import { DomainError } from '../../../core/errors/domain-error';

const TERMINAL = [
  OrderStatus.COMPLETED,
  OrderStatus.CANCELLED,
  OrderStatus.REFUNDED,
  OrderStatus.RX_REJECTED,
];

describe('order state machine', () => {
  it('allows the Rx-gated happy path', () => {
    expect(canTransition(OrderStatus.CREATED, OrderStatus.AWAITING_RX_VERIFICATION)).toBe(true);
    expect(canTransition(OrderStatus.AWAITING_RX_VERIFICATION, OrderStatus.RX_VERIFIED)).toBe(true);
    expect(canTransition(OrderStatus.RX_VERIFIED, OrderStatus.AWAITING_PAYMENT)).toBe(true);
    expect(canTransition(OrderStatus.AWAITING_PAYMENT, OrderStatus.PAID)).toBe(true);
    expect(canTransition(OrderStatus.PAID, OrderStatus.FULFILLING)).toBe(true);
    expect(canTransition(OrderStatus.FULFILLING, OrderStatus.READY_FOR_PICKUP)).toBe(true);
    expect(canTransition(OrderStatus.READY_FOR_PICKUP, OrderStatus.COMPLETED)).toBe(true);
  });

  it('lets an OTC order skip Rx verification', () => {
    expect(canTransition(OrderStatus.CREATED, OrderStatus.AWAITING_PAYMENT)).toBe(true);
  });

  it('rejects illegal transitions', () => {
    expect(canTransition(OrderStatus.AWAITING_PAYMENT, OrderStatus.COMPLETED)).toBe(false);
    expect(canTransition(OrderStatus.PAID, OrderStatus.COMPLETED)).toBe(false);
    expect(canTransition(OrderStatus.AWAITING_RX_VERIFICATION, OrderStatus.PAID)).toBe(false);
    expect(canTransition(OrderStatus.REFUNDED, OrderStatus.PAID)).toBe(false);
  });

  it('treats terminal states as terminal', () => {
    for (const s of TERMINAL) expect(ORDER_TRANSITIONS[s]).toEqual([]);
  });

  it('can resolve STOCK_HOLD to fulfilling or unwind it', () => {
    expect(canTransition(OrderStatus.STOCK_HOLD, OrderStatus.FULFILLING)).toBe(true);
    expect(canTransition(OrderStatus.STOCK_HOLD, OrderStatus.REFUNDED)).toBe(true);
  });

  it('assertTransition throws DomainError(CONFLICT) on an illegal move', () => {
    let err: unknown;
    try {
      assertTransition(OrderStatus.PAID, OrderStatus.COMPLETED);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(DomainError);
    expect((err as DomainError).code).toBe(ErrorCode.CONFLICT);
  });

  it('assertTransition passes a legal move', () => {
    expect(() => assertTransition(OrderStatus.AWAITING_PAYMENT, OrderStatus.PAID)).not.toThrow();
  });

  it('only references real OrderStatus values', () => {
    const valid = new Set(Object.values(OrderStatus));
    for (const [from, targets] of Object.entries(ORDER_TRANSITIONS)) {
      expect(valid.has(from as OrderStatus)).toBe(true);
      for (const to of targets) expect(valid.has(to)).toBe(true);
    }
  });
});
