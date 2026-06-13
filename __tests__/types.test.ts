/**
 * croo-core/types — Tests for the runtime constants.
 *
 * The critical test here is the DRIFT GUARD: core keeps local copies of the
 * SDK's EventType / DeliverableType (to avoid a load-time SDK dependency), so
 * we assert they are byte-for-byte identical to @croo-network/sdk. This is the
 * regression guard for the bug where `negotiation_created` silently diverged
 * from the SDK's `order_negotiation_created`.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { EventType, DeliverableType } from '../src/types.js';
import {
  EventType as SdkEventType,
  DeliverableType as SdkDeliverableType,
} from '@croo-network/sdk';

function sdkAvailable(): boolean {
  try {
    createRequire(import.meta.url).resolve('@croo-network/sdk');
    return true;
  } catch {
    return false;
  }
}

describe('EventType', () => {
  it('has all 8 WebSocket event types', () => {
    expect(Object.keys(EventType)).toHaveLength(8);
  });

  it('uses the order_negotiation_* names the SDK emits', () => {
    expect(EventType.NegotiationCreated).toBe('order_negotiation_created');
    expect(EventType.NegotiationRejected).toBe('order_negotiation_rejected');
    expect(EventType.NegotiationExpired).toBe('order_negotiation_expired');
  });

  it('has correct order events', () => {
    expect(EventType.OrderCreated).toBe('order_created');
    expect(EventType.OrderPaid).toBe('order_paid');
    expect(EventType.OrderCompleted).toBe('order_completed');
    expect(EventType.OrderRejected).toBe('order_rejected');
    expect(EventType.OrderExpired).toBe('order_expired');
  });
});

describe('DeliverableType', () => {
  it('matches the SDK string values', () => {
    expect(DeliverableType.Text).toBe('text');
    expect(DeliverableType.Schema).toBe('schema');
  });
});

// ── DRIFT GUARD ──────────────────────────────────────────────────────
describe.runIf(sdkAvailable())('SDK constant parity', () => {
  it('EventType is identical to @croo-network/sdk', () => {
    expect(EventType).toEqual(SdkEventType);
  });

  it('DeliverableType is identical to @croo-network/sdk', () => {
    expect(DeliverableType).toEqual(SdkDeliverableType);
  });
});
