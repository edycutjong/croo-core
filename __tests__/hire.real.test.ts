/**
 * croo-core/hire — edge cases of the REAL (non-mock) requester flow.
 *
 * hire.test.ts covers the happy path + mock mode. This file covers the
 * error/branch paths: missing order_id, schema-delivery parsing (+ fallback),
 * non-matching events, the WebSocket timeout, and the amountPaid optional
 * chain — all with fake clients (no network, no USDC).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hire } from '../src/hire.js';

class FakeStream {
  handlers: Record<string, ((e: Record<string, unknown>) => void)[]> = {};
  closed = false;
  on(type: string, h: (e: Record<string, unknown>) => void) {
    (this.handlers[type] ??= []).push(h);
  }
  emit(type: string, e: Record<string, unknown>) {
    (this.handlers[type] ?? []).forEach((h) => h(e));
  }
  onAny() {}
  err() {
    return null;
  }
  close() {
    this.closed = true;
  }
}

/** Client that completes the flow, with configurable delivery + payResult. */
function fullClient(
  stream: FakeStream,
  delivery: Record<string, unknown>,
  payResult: Record<string, unknown> = { txHash: 'tx', order: { price: '0.05' } },
) {
  return {
    connectWebSocket: vi.fn(async () => stream),
    negotiateOrder: vi.fn(async () => {
      setImmediate(() =>
        stream.emit('order_created', { negotiation_id: 'neg_1', order_id: 'ord_1' }),
      );
      return { negotiationId: 'neg_1' };
    }),
    payOrder: vi.fn(async (orderId: string) => {
      setImmediate(() => stream.emit('order_completed', { order_id: orderId }));
      return payResult;
    }),
    getDelivery: vi.fn(async () => delivery),
  };
}

describe('hire — real flow edge cases', () => {
  beforeEach(() => {
    delete process.env.CROO_MOCK; // force the real path
  });

  it('throws and closes the stream if order_created has no order_id', async () => {
    const stream = new FakeStream();
    const client = {
      connectWebSocket: vi.fn(async () => stream),
      negotiateOrder: vi.fn(async () => {
        setImmediate(() => stream.emit('order_created', { negotiation_id: 'neg_1' }));
        return { negotiationId: 'neg_1' };
      }),
    };

    await expect(hire(client, { serviceId: 's', requirement: {} })).rejects.toThrow(
      'without an order_id',
    );
    expect(stream.closed).toBe(true);
  });

  it('JSON-parses a schema deliverable', async () => {
    const stream = new FakeStream();
    const client = fullClient(stream, {
      deliverableType: 'schema',
      deliverableSchema: '{"score":92}',
    });

    const result = await hire<{ score: number }>(client, { serviceId: 's', requirement: {} });
    expect(result.delivery).toEqual({ score: 92 });
  });

  it('falls back to the raw schema string when it is not valid JSON', async () => {
    const stream = new FakeStream();
    const client = fullClient(stream, {
      deliverableType: 'schema',
      deliverableSchema: 'not json',
    });

    const result = await hire(client, { serviceId: 's', requirement: {} });
    expect(result.delivery).toBe('not json');
  });

  it('uses deliverableText when a schema type carries no schema body', async () => {
    const stream = new FakeStream();
    const client = fullClient(stream, {
      deliverableType: 'schema',
      deliverableText: 'text fallback',
    });

    const result = await hire(client, { serviceId: 's', requirement: {} });
    expect(result.delivery).toBe('text fallback');
  });

  it('returns undefined amountPaid when payResult has no order', async () => {
    const stream = new FakeStream();
    const client = fullClient(
      stream,
      { deliverableType: 'text', deliverableText: 'x' },
      { txHash: '0xonly' },
    );

    const result = await hire(client, { serviceId: 's', requirement: {} });
    expect(result.txHash).toBe('0xonly');
    expect(result.amountPaid).toBeUndefined();
  });

  it('ignores events that do not match the predicate', async () => {
    const stream = new FakeStream();
    const client = {
      connectWebSocket: vi.fn(async () => stream),
      negotiateOrder: vi.fn(async () => {
        setImmediate(() => {
          stream.emit('order_created', { negotiation_id: 'OTHER', order_id: 'nope' });
          stream.emit('order_created', { negotiation_id: 'neg_1', order_id: 'ord_1' });
        });
        return { negotiationId: 'neg_1' };
      }),
      payOrder: vi.fn(async (id: string) => {
        setImmediate(() => stream.emit('order_completed', { order_id: id }));
        return { txHash: 'tx', order: { price: '1' } };
      }),
      getDelivery: vi.fn(async () => ({ deliverableType: 'text', deliverableText: 'ok' })),
    };

    const result = await hire(client, { serviceId: 's', requirement: {} });
    expect(result.orderId).toBe('ord_1'); // matched the 2nd event, ignored the 1st
  });

  it('times out and closes the stream when the event never arrives', async () => {
    vi.useFakeTimers();
    try {
      const stream = new FakeStream();
      const client = {
        connectWebSocket: vi.fn(async () => stream),
        negotiateOrder: vi.fn(async () => ({ negotiationId: 'neg_1' })), // never emits
      };

      const promise = hire(client, { serviceId: 's', requirement: {} });
      const assertion = expect(promise).rejects.toThrow('Timeout waiting for order_created');
      await vi.advanceTimersByTimeAsync(30_001);
      await assertion;
      expect(stream.closed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
