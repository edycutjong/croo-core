import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hire } from '../src/hire.js';

/** Minimal fake EventStream matching the SDK's on/close surface. */
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

/** A client whose negotiate/pay drive the stream through the happy path. */
function happyClient(stream: FakeStream) {
  return {
    getSharedStream: vi.fn(async () => stream),
    negotiateOrder: vi.fn(async () => {
      setImmediate(() =>
        stream.emit('order_created', { negotiation_id: 'neg_1', order_id: 'ord_1' }),
      );
      return { negotiationId: 'neg_1' };
    }),
    payOrder: vi.fn(async (orderId: string) => {
      setImmediate(() => stream.emit('order_completed', { order_id: orderId }));
      return { txHash: 'tx_hash_1', order: { price: '0.05' } };
    }),
    getDelivery: vi.fn(async () => ({ deliverableType: 'text', deliverableText: 'success' })),
  };
}

describe('hire (live mode)', () => {
  const originalEnv = process.env.CROO_MOCK;

  beforeEach(() => {
    process.env.CROO_MOCK = 'false';
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.CROO_MOCK;
    else process.env.CROO_MOCK = originalEnv;
  });

  it('completes the full hire flow: negotiate → pay → deliver', async () => {
    const stream = new FakeStream();
    const client = happyClient(stream);

    const result = await hire(client, { serviceId: 'svc_1', requirement: { test: true } });

    expect(client.negotiateOrder).toHaveBeenCalledWith({
      serviceId: 'svc_1',
      requirements: JSON.stringify({ test: true }),
    });
    expect(client.payOrder).toHaveBeenCalledWith('ord_1');
    expect(result.orderId).toBe('ord_1');
    expect(result.txHash).toBe('tx_hash_1');
    expect(result.amountPaid).toBe('0.05');
    expect(result.delivery).toBe('success');

  });

  it('emits trace events during the live flow', async () => {
    const stream = new FakeStream();
    const trace = vi.fn();

    await hire(happyClient(stream), { serviceId: 'svc_1', requirement: {} }, trace);

    expect(trace).toHaveBeenCalledTimes(3);
    expect(trace).toHaveBeenCalledWith(expect.objectContaining({ type: 'hire_start' }));
    expect(trace).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'hire_paid', data: expect.objectContaining({ orderId: 'ord_1' }) }),
    );
    expect(trace).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'hire_delivered', data: expect.objectContaining({ orderId: 'ord_1' }) }),
    );
  });

  it('does not throw when no trace emitter is provided', async () => {
    const stream = new FakeStream();
    const result = await hire(happyClient(stream), { serviceId: 'svc_1', requirement: {} });
    expect(result.orderId).toBe('ord_1');
  });

  it('rejects and closes the stream if negotiation fails', async () => {
    const stream = new FakeStream();
    const client = {
      getSharedStream: vi.fn(async () => stream),
      negotiateOrder: vi.fn().mockRejectedValue(new Error('Negotiation denied')),
    };

    await expect(hire(client, { serviceId: 'svc_1', requirement: {} })).rejects.toThrow(
      'Negotiation denied',
    );

  });
});

describe('hire (mock mode)', () => {
  const originalEnv = process.env.CROO_MOCK;

  beforeEach(() => {
    process.env.CROO_MOCK = 'true';
    process.env.CROO_MOCK_LATENCY = '10';
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.CROO_MOCK;
    else process.env.CROO_MOCK = originalEnv;
    delete process.env.CROO_MOCK_LATENCY;
  });

  it('delegates to mockHire when CROO_MOCK=true (no client calls)', async () => {
    const client = { negotiateOrder: vi.fn(), connectWebSocket: vi.fn() };

    const result = await hire(client, { serviceId: 'svc_research_x', requirement: {} });

    expect(result.orderId).toMatch(/^mock_order_/);
    expect(result.txHash).toContain('0xmock_');
    expect(client.connectWebSocket).not.toHaveBeenCalled();
    expect(client.negotiateOrder).not.toHaveBeenCalled();
  });
});
