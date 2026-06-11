/**
 * croo-core/types — Tests for type constants and enum values.
 */
import { describe, it, expect } from 'vitest';
import { EventType } from '../src/types.js';

describe('EventType', () => {
  it('has all 8 WebSocket event types', () => {
    expect(Object.keys(EventType)).toHaveLength(8);
  });

  it('has correct negotiation events', () => {
    expect(EventType.NegotiationCreated).toBe('negotiation_created');
    expect(EventType.NegotiationRejected).toBe('negotiation_rejected');
    expect(EventType.NegotiationExpired).toBe('negotiation_expired');
  });

  it('has correct order events', () => {
    expect(EventType.OrderCreated).toBe('order_created');
    expect(EventType.OrderPaid).toBe('order_paid');
    expect(EventType.OrderCompleted).toBe('order_completed');
    expect(EventType.OrderRejected).toBe('order_rejected');
    expect(EventType.OrderExpired).toBe('order_expired');
  });

  it('values match the CROO SDK reference (snake_case)', () => {
    for (const value of Object.values(EventType)) {
      expect(value).toMatch(/^[a-z]+_[a-z]+$/);
    }
  });
});
