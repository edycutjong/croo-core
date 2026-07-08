/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runProvider } from '../src/provider.js';
import { EventType } from '../src/types.js';

/** Find the handler registered for a given event type on a mocked stream. */
function handlerFor(stream: { on: { mock: { calls: unknown[][] } } }, type: string) {
  return stream.on.mock.calls.find((c) => c[0] === type)![1] as (
    e: Record<string, unknown>,
  ) => Promise<void> | void;
}

describe('runProvider', () => {
  const originalEnv = process.env.CROO_MOCK;

  beforeEach(() => {
    vi.useFakeTimers();
    process.env.CROO_MOCK = 'false'; // exercise the real provider loop
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalEnv === undefined) delete process.env.CROO_MOCK;
    else process.env.CROO_MOCK = originalEnv;
  });

  it('connects to the websocket and registers negotiation + order handlers', async () => {
    const stream = { on: vi.fn() };
    const client = { connectWebSocket: vi.fn().mockResolvedValue(stream) };

    await runProvider(client as any, {
      serviceMatch: () => true,
      work: async () => ({ type: 'text', data: 'ok' }),
    });

    expect(client.connectWebSocket).toHaveBeenCalled();
    expect(stream.on).toHaveBeenCalledWith(EventType.NegotiationCreated, expect.any(Function));
    expect(stream.on).toHaveBeenCalledWith(EventType.OrderPaid, expect.any(Function));
  });

  it('reuses the shared stream when the client exposes getSharedStream', async () => {
    const stream = { on: vi.fn() };
    const getSharedStream = vi.fn().mockResolvedValue(stream);
    const connectWebSocket = vi.fn();
    const client = { getSharedStream, connectWebSocket };

    await runProvider(client as any, {
      serviceMatch: () => true,
      work: async () => ({ type: 'text', data: 'ok' }),
    });

    // Providers that are also requesters must reuse the singleton stream,
    // never open a second WebSocket with the same SDK key.
    expect(getSharedStream).toHaveBeenCalled();
    expect(connectWebSocket).not.toHaveBeenCalled();
    expect(stream.on).toHaveBeenCalledWith(EventType.NegotiationCreated, expect.any(Function));
  });

  it('accepts a negotiation when serviceMatch returns true', async () => {
    const stream = { on: vi.fn() };
    const client = {
      connectWebSocket: vi.fn().mockResolvedValue(stream),
      acceptNegotiation: vi.fn().mockResolvedValue({}),
    };

    await runProvider(client as any, {
      serviceMatch: (e) => e.service_id === 'my_service',
      work: async () => ({ type: 'text', data: 'ok' }),
    });

    await handlerFor(stream, EventType.NegotiationCreated)({
      negotiation_id: 'neg_1',
      service_id: 'my_service',
    });
    expect(client.acceptNegotiation).toHaveBeenCalledWith('neg_1');
  });

  it('ignores a negotiation when serviceMatch returns false', async () => {
    const stream = { on: vi.fn() };
    const client = {
      connectWebSocket: vi.fn().mockResolvedValue(stream),
      acceptNegotiation: vi.fn(),
    };

    await runProvider(client as any, {
      serviceMatch: (e) => e.service_id === 'my_service',
      work: async () => ({ type: 'text', data: 'ok' }),
    });

    await handlerFor(stream, EventType.NegotiationCreated)({
      negotiation_id: 'neg_1',
      service_id: 'other_service',
    });
    expect(client.acceptNegotiation).not.toHaveBeenCalled();
  });

  it('ignores a negotiation event with no negotiation_id', async () => {
    const stream = { on: vi.fn() };
    const client = {
      connectWebSocket: vi.fn().mockResolvedValue(stream),
      acceptNegotiation: vi.fn(),
    };

    await runProvider(client as any, {
      serviceMatch: () => true,
      work: async () => ({ type: 'text', data: 'ok' }),
    });

    await handlerFor(stream, EventType.NegotiationCreated)({ service_id: 'my_service' });
    expect(client.acceptNegotiation).not.toHaveBeenCalled();
  });

  it('handles a paid order: getOrder → work → deliverOrder (mapped to DeliverOrderRequest)', async () => {
    const stream = { on: vi.fn() };
    const order = { orderId: 'ord_1', serviceId: 'my_service', status: 'paid' };
    const client = {
      connectWebSocket: vi.fn().mockResolvedValue(stream),
      getOrder: vi.fn().mockResolvedValue(order),
      deliverOrder: vi.fn().mockResolvedValue({}),
    };
    const workFn = vi.fn().mockResolvedValue({ type: 'text', data: 'done' });

    await runProvider(client as any, { serviceMatch: () => true, work: workFn });

    await handlerFor(stream, EventType.OrderPaid)({ order_id: 'ord_1' });

    expect(client.getOrder).toHaveBeenCalledWith('ord_1');
    expect(workFn).toHaveBeenCalledWith(order);
    expect(client.deliverOrder).toHaveBeenCalledWith('ord_1', {
      deliverableType: 'text',
      deliverableText: 'done',
    });
  });

  it('maps a schema deliverable to deliverableSchema JSON', async () => {
    const stream = { on: vi.fn() };
    const client = {
      connectWebSocket: vi.fn().mockResolvedValue(stream),
      getOrder: vi.fn().mockResolvedValue({ orderId: 'ord_s', status: 'paid' }),
      deliverOrder: vi.fn().mockResolvedValue({}),
    };

    await runProvider(client as any, {
      serviceMatch: () => true,
      work: async () => ({ type: 'schema', data: { score: 92 } }),
    });

    await handlerFor(stream, EventType.OrderPaid)({ order_id: 'ord_s' });
    expect(client.deliverOrder).toHaveBeenCalledWith('ord_s', {
      deliverableType: 'schema',
      deliverableSchema: '{"score":92}',
    });
  });

  it('ignores an order_paid event with no order_id', async () => {
    const stream = { on: vi.fn() };
    const client = {
      connectWebSocket: vi.fn().mockResolvedValue(stream),
      getOrder: vi.fn(),
    };

    await runProvider(client as any, {
      serviceMatch: () => true,
      work: async () => ({ type: 'text', data: 'x' }),
    });

    await handlerFor(stream, EventType.OrderPaid)({});
    expect(client.getOrder).not.toHaveBeenCalled();
  });

  it('rejects the order when the work function throws', async () => {
    const stream = { on: vi.fn() };
    const client = {
      connectWebSocket: vi.fn().mockResolvedValue(stream),
      getOrder: vi.fn().mockResolvedValue({ orderId: 'ord_1', status: 'paid' }),
      deliverOrder: vi.fn(),
      rejectOrder: vi.fn().mockResolvedValue(undefined),
    };

    await runProvider(client as any, {
      serviceMatch: () => true,
      work: vi.fn().mockRejectedValue(new Error('Work error')),
    });

    await handlerFor(stream, EventType.OrderPaid)({ order_id: 'ord_1' });
    expect(client.rejectOrder).toHaveBeenCalledWith('ord_1', 'Provider internal error during execution');
  });

  it('logs but does not crash when the fallback rejectOrder also fails', async () => {
    const stream = { on: vi.fn() };
    const client = {
      connectWebSocket: vi.fn().mockResolvedValue(stream),
      getOrder: vi.fn().mockResolvedValue({ orderId: 'ord_2', status: 'paid' }),
      deliverOrder: vi.fn(),
      rejectOrder: vi.fn().mockRejectedValue(new Error('reject failed too')),
    };

    await runProvider(client as any, {
      serviceMatch: () => true,
      work: vi.fn().mockRejectedValue(new Error('Work error')),
    });

    await expect(handlerFor(stream, EventType.OrderPaid)({ order_id: 'ord_2' })).resolves.toBeUndefined();
    expect(client.rejectOrder).toHaveBeenCalledWith('ord_2', 'Provider internal error during execution');
  });

  it('surfaces a CrooSafeError message verbatim as the rejection reason', async () => {
    const stream = { on: vi.fn() };
    const safe = new Error('Insufficient market data — refund issued');
    safe.name = 'CrooSafeError';
    const client = {
      connectWebSocket: vi.fn().mockResolvedValue(stream),
      getOrder: vi.fn().mockResolvedValue({ orderId: 'ord_safe', status: 'paid' }),
      deliverOrder: vi.fn(),
      rejectOrder: vi.fn().mockResolvedValue(undefined),
    };

    await runProvider(client as any, {
      serviceMatch: () => true,
      work: vi.fn().mockRejectedValue(safe),
    });

    await handlerFor(stream, EventType.OrderPaid)({ order_id: 'ord_safe' });
    expect(client.rejectOrder).toHaveBeenCalledWith('ord_safe', 'Insufficient market data — refund issued');
  });

  it('swallows acceptNegotiation failures instead of crashing the loop', async () => {
    const stream = { on: vi.fn() };
    const client = {
      connectWebSocket: vi.fn().mockResolvedValue(stream),
      acceptNegotiation: vi.fn().mockRejectedValue(new Error('accept failed')),
    };

    await runProvider(client as any, {
      serviceMatch: () => true,
      work: async () => ({ type: 'text', data: 'ok' }),
    });

    await expect(
      handlerFor(stream, EventType.NegotiationCreated)({ negotiation_id: 'neg_x', service_id: 's' }),
    ).resolves.toBeUndefined();
    expect(client.acceptNegotiation).toHaveBeenCalledWith('neg_x');
  });

  it('fires the SLA guard before the deadline (clean refund)', async () => {
    const stream = { on: vi.fn() };
    const order = {
      orderId: 'ord_3',
      status: 'paid',
      slaDeadline: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
    const client = {
      connectWebSocket: vi.fn().mockResolvedValue(stream),
      getOrder: vi.fn().mockResolvedValue(order),
      deliverOrder: vi.fn(),
      rejectOrder: vi.fn().mockResolvedValue(undefined),
    };
    const workFn = vi
      .fn()
      .mockImplementation(() => new Promise((r) => setTimeout(r, 16 * 60 * 1000)));

    await runProvider(client as any, { serviceMatch: () => true, work: workFn, slaGuardMs: 60_000 });

    handlerFor(stream, EventType.OrderPaid)({ order_id: 'ord_3' }); // don't await — work hangs

    await vi.advanceTimersByTimeAsync(14.5 * 60 * 1000); // cross deadline - 60s
    expect(client.rejectOrder).toHaveBeenCalledWith(
      'ord_3',
      expect.stringContaining('SLA guard'),
    );
  });

  it('swallows errors thrown by the SLA-guard rejectOrder', async () => {
    const stream = { on: vi.fn() };
    const order = {
      orderId: 'ord_4',
      status: 'paid',
      slaDeadline: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
    const client = {
      connectWebSocket: vi.fn().mockResolvedValue(stream),
      getOrder: vi.fn().mockResolvedValue(order),
      deliverOrder: vi.fn(),
      rejectOrder: vi.fn().mockRejectedValue(new Error('already settled')),
    };
    const workFn = vi
      .fn()
      .mockImplementation(() => new Promise((r) => setTimeout(r, 16 * 60 * 1000)));

    await runProvider(client as any, { serviceMatch: () => true, work: workFn, slaGuardMs: 60_000 });

    handlerFor(stream, EventType.OrderPaid)({ order_id: 'ord_4' });
    await vi.advanceTimersByTimeAsync(14.5 * 60 * 1000);

    expect(client.rejectOrder).toHaveBeenCalledWith('ord_4', expect.stringContaining('SLA guard'));
  });

  it('rejects unmatched negotiations', async () => {
    const stream = { on: vi.fn() };
    const client = {
      connectWebSocket: vi.fn().mockResolvedValue(stream),
      rejectNegotiation: vi.fn().mockResolvedValue({}),
    };

    await runProvider(client as any, {
      serviceMatch: (e) => e.service_id === 'my_service',
      work: async () => ({ type: 'text', data: 'ok' }),
    });

    await handlerFor(stream, EventType.NegotiationCreated)({
      negotiation_id: 'neg_unmatched',
      service_id: 'other_service',
    });
    expect(client.rejectNegotiation).toHaveBeenCalledWith('neg_unmatched', expect.any(String));
  });

  it('accepts negotiation with fund address when payoutAddress is set', async () => {
    const stream = { on: vi.fn() };
    const client = {
      connectWebSocket: vi.fn().mockResolvedValue(stream),
      acceptNegotiationWithFundAddress: vi.fn().mockResolvedValue({}),
    };

    await runProvider(client as any, {
      serviceMatch: () => true,
      payoutAddress: '0x1234567890123456789012345678901234567890',
      work: async () => ({ type: 'text', data: 'ok' }),
    });

    await handlerFor(stream, EventType.NegotiationCreated)({
      negotiation_id: 'neg_payout',
      service_id: 'any',
    });
    expect(client.acceptNegotiationWithFundAddress).toHaveBeenCalledWith('neg_payout', '0x1234567890123456789012345678901234567890');
  });

  it('runs active state recovery on startup if enableStateRecovery is true', async () => {
    const stream = { on: vi.fn() };
    const order = { orderId: 'ord_rec', negotiationId: 'neg_rec', status: 'paid' };
    const client = {
      connectWebSocket: vi.fn().mockResolvedValue(stream),
      listOrders: vi.fn().mockResolvedValue([order]),
      deliverOrder: vi.fn().mockResolvedValue({}),
    };
    const workFn = vi.fn().mockResolvedValue({ type: 'text', data: 'recovered' });

    await runProvider(client as any, {
      serviceMatch: () => true,
      enableStateRecovery: true,
      work: workFn,
    });

    // Advance Vitest fake timers to process the background recovery promise
    await vi.advanceTimersByTimeAsync(10);

    expect(client.listOrders).toHaveBeenCalledWith({ role: 'provider', status: 'paid' });
    expect(workFn).toHaveBeenCalledWith(order);
    expect(client.deliverOrder).toHaveBeenCalledWith('ord_rec', {
      deliverableType: 'text',
      deliverableText: 'recovered',
    });
  });

  it('sets up WebSocket handlers for rejections and expirations', async () => {
    const stream = { on: vi.fn() };
    const client = {
      connectWebSocket: vi.fn().mockResolvedValue(stream),
    };
    const handlers = {
      serviceMatch: () => true,
      work: async () => ({ type: 'text' as const, data: 'ok' }),
      onNegotiationRejected: vi.fn(),
      onNegotiationExpired: vi.fn(),
      onOrderRejected: vi.fn(),
      onOrderExpired: vi.fn(),
    };

    await runProvider(client as any, handlers);

    expect(stream.on).toHaveBeenCalledWith(EventType.NegotiationRejected, expect.any(Function));
    expect(stream.on).toHaveBeenCalledWith(EventType.NegotiationExpired, expect.any(Function));
    expect(stream.on).toHaveBeenCalledWith(EventType.OrderRejected, expect.any(Function));
    expect(stream.on).toHaveBeenCalledWith(EventType.OrderExpired, expect.any(Function));

    // Fire handlers
    const negRejectedEvent = { negotiation_id: 'neg_rej' };
    await handlerFor(stream, EventType.NegotiationRejected)(negRejectedEvent);
    expect(handlers.onNegotiationRejected).toHaveBeenCalledWith(negRejectedEvent);

    const negExpiredEvent = { negotiation_id: 'neg_exp' };
    await handlerFor(stream, EventType.NegotiationExpired)(negExpiredEvent);
    expect(handlers.onNegotiationExpired).toHaveBeenCalledWith(negExpiredEvent);

    const orderRejectedEvent = { order_id: 'ord_rej' };
    await handlerFor(stream, EventType.OrderRejected)(orderRejectedEvent);
    expect(handlers.onOrderRejected).toHaveBeenCalledWith(orderRejectedEvent);

    const orderExpiredEvent = { order_id: 'ord_exp' };
    await handlerFor(stream, EventType.OrderExpired)(orderExpiredEvent);
    expect(handlers.onOrderExpired).toHaveBeenCalledWith(orderExpiredEvent);
  });

  it('logs error when active state recovery listOrders fails', async () => {
    const stream = { on: vi.fn() };
    const client = {
      connectWebSocket: vi.fn().mockResolvedValue(stream),
      listOrders: vi.fn().mockRejectedValue(new Error('listOrders error')),
    };
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await runProvider(client as any, {
      serviceMatch: () => true,
      enableStateRecovery: true,
      work: async () => ({ type: 'text', data: 'ok' }),
    });

    await vi.advanceTimersByTimeAsync(10);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[provider] Active state recovery failed:'),
      expect.any(Error),
    );
  });

  it('logs error when active state recovery processing of a paid order fails', async () => {
    const stream = { on: vi.fn() };
    const order = {
      orderId: 'ord_rec_fail',
      status: 'paid',
      get slaDeadline() {
        throw new Error('slaDeadline error');
      },
    };
    const client = {
      connectWebSocket: vi.fn().mockResolvedValue(stream),
      listOrders: vi.fn().mockResolvedValue([order]),
    };
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await runProvider(client as any, {
      serviceMatch: () => true,
      enableStateRecovery: true,
      work: async () => ({ type: 'text', data: 'ok' }),
    });

    await vi.advanceTimersByTimeAsync(10);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[provider] Recovery processing failed for order ord_rec_fail:'),
      expect.any(Error),
    );
  });

  it('logs error when OrderPaid event handler fails to fetch order details', async () => {
    const stream = { on: vi.fn() };
    const client = {
      connectWebSocket: vi.fn().mockResolvedValue(stream),
      getOrder: vi.fn().mockRejectedValue(new Error('getOrder error')),
    };
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await runProvider(client as any, {
      serviceMatch: () => true,
      work: async () => ({ type: 'text', data: 'ok' }),
    });

    await handlerFor(stream, EventType.OrderPaid)({ order_id: 'ord_get_fail' });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[provider] Failed to fetch or process order ord_get_fail:'),
      expect.any(Error),
    );
  });

  it('returns a mock stream when CROO_MOCK=true (never opens a real WebSocket)', async () => {
    process.env.CROO_MOCK = 'true';
    const connectWebSocket = vi.fn();

    const stream = await runProvider(
      { connectWebSocket } as any,
      { serviceMatch: () => true, work: async () => ({ type: 'text', data: 'ok' }) },
    );

    expect(connectWebSocket).not.toHaveBeenCalled();
    expect(typeof (stream as { simulateOrder?: unknown }).simulateOrder).toBe('function');
    expect(() => (stream as { close: () => void }).close()).not.toThrow();
  });
});
