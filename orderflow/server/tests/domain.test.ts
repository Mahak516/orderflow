import { describe, expect, it } from 'vitest';
import { ORDER_STATUSES, canTransition, isTerminal, nextStatuses } from '../src/domain/orderStatus';

describe('order status state machine', () => {
  it('allows the normal happy path', () => {
    expect(canTransition('pending', 'paid')).toBe(true);
    expect(canTransition('paid', 'shipped')).toBe(true);
    expect(canTransition('shipped', 'delivered')).toBe(true);
  });

  it('does not allow skipping steps', () => {
    expect(canTransition('pending', 'shipped')).toBe(false);
    expect(canTransition('pending', 'delivered')).toBe(false);
    expect(canTransition('paid', 'delivered')).toBe(false);
  });

  it('allows cancelling only before shipping', () => {
    expect(canTransition('pending', 'cancelled')).toBe(true);
    expect(canTransition('paid', 'cancelled')).toBe(true);
    expect(canTransition('shipped', 'cancelled')).toBe(false);
  });

  it('treats delivered and cancelled as final', () => {
    expect(isTerminal('delivered')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('paid')).toBe(false);
    expect(nextStatuses('delivered')).toEqual([]);
  });

  it('never allows a status to move to itself', () => {
    for (const status of ORDER_STATUSES) {
      expect(canTransition(status, status)).toBe(false);
    }
  });
});
