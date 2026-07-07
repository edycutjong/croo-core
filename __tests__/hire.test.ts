/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hire } from '../src/hire.js';

/**
 * A client whose negotiate/pay/poll methods drive the REST-polling happy path.
 * hire() polls getNegotiation()/getOrder() instead of listening for WebSocket
 * events, because the CROO backend does not reliably push order lifecycle
 * events to the requester's socket.
 */
function happyClient() {
  let paid = false;
  return {
    negotiateOrder: vi.fn(async () => ({ negotiationId: 'neg_1' })),
    getNegotiation: vi.fn(async () => ({ status: 'accepted', orderId: 'ord_1' })),
    // 'created' (payable) before payment, 'completed' after.
    getOrder: vi.fn(async () => ({ status: paid ? 'completed' : 'created' })),
    payOrder: vi.fn(async () => {
      paid = true;
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
    const client = happyClient();

    const result = await hire(client as any, { serviceId: 'svc_1', requirement: { test: true } });

    expect(client.negotiateOrder).toHaveBeenCalledWith({
      serviceId: 'svc_1',
      requirements: JSON.stringify({ test: true }),
    });
    expect(client.getNegotiation).toHaveBeenCalledWith('neg_1');
    expect(client.payOrder).toHaveBeenCalledWith('ord_1');
    expect(client.getOrder).toHaveBeenCalledWith('ord_1');
    expect(result.orderId).toBe('ord_1');
    expect(result.txHash).toBe('tx_hash_1');
    expect(result.amountPaid).toBe('0.05');
    expect(result.delivery).toBe('success');
  });

  it('emits trace events during the live flow', async () => {
    const trace = vi.fn();

    await hire(happyClient() as any, { serviceId: 'svc_1', requirement: {} }, trace);

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
    const result = await hire(happyClient() as any, { serviceId: 'svc_1', requirement: {} });
    expect(result.orderId).toBe('ord_1');
  });

  it('rejects if negotiation fails', async () => {
    const client = {
      negotiateOrder: vi.fn().mockRejectedValue(new Error('Negotiation denied')),
    };

    await expect(hire(client as any, { serviceId: 'svc_1', requirement: {} })).rejects.toThrow(
      'Negotiation denied',
    );
  });

  it('throws ORDER_REJECTED when the order is rejected after payment', async () => {
    let paid = false;
    const client = {
      negotiateOrder: vi.fn(async () => ({ negotiationId: 'neg_1' })),
      getNegotiation: vi.fn(async () => ({ status: 'accepted', orderId: 'ord_1' })),
      getOrder: vi.fn(async () => ({ status: paid ? 'rejected' : 'created' })),
      payOrder: vi.fn(async () => {
        paid = true;
        return { txHash: 'tx_hash_1', order: { price: '0.05' } };
      }),
      getDelivery: vi.fn(),
    };

    await expect(hire(client as any, { serviceId: 'svc_1', requirement: {} })).rejects.toThrow(
      'ORDER_REJECTED',
    );
  });

  it('throws ORDER_EXPIRED when the order expires', async () => {
    let paid = false;
    const client = {
      negotiateOrder: vi.fn(async () => ({ negotiationId: 'neg_1' })),
      getNegotiation: vi.fn(async () => ({ status: 'accepted', orderId: 'ord_1' })),
      getOrder: vi.fn(async () => ({ status: paid ? 'expired' : 'created' })),
      payOrder: vi.fn(async () => {
        paid = true;
        return { txHash: 'tx_hash_1', order: { price: '0.05' } };
      }),
      getDelivery: vi.fn(),
    };

    await expect(hire(client as any, { serviceId: 'svc_1', requirement: {} })).rejects.toThrow(
      'ORDER_EXPIRED',
    );
  });

  it('rejects with a completion timeout when the order never completes', async () => {
    vi.useFakeTimers();
    let paid = false;
    const client = {
      negotiateOrder: vi.fn(async () => ({ negotiationId: 'neg_1' })),
      getNegotiation: vi.fn(async () => ({ status: 'accepted', orderId: 'ord_1' })),
      getOrder: vi.fn(async () => ({ status: paid ? 'paid' : 'created' })), // never completes after pay
      payOrder: vi.fn(async () => {
        paid = true;
        return { txHash: 'tx_hash_1', order: { price: '0.05' } };
      }),
      getDelivery: vi.fn(),
    };

    const hirePromise = hire(client as any, { serviceId: 'svc_1', requirement: {} });
    // Let the synchronous negotiate/accept/pay microtasks settle.
    await vi.advanceTimersByTimeAsync(10);
    const assertionPromise = expect(hirePromise).rejects.toThrow(
      'Timeout waiting for order ord_1 completion',
    );
    await vi.advanceTimersByTimeAsync(300_000);
    await assertionPromise;
    vi.useRealTimers();
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

    const result = await hire(client as any, { serviceId: 'svc_research_x', requirement: {} });

    expect(result.orderId).toMatch(/^mock_order_/);
    expect(result.txHash).toContain('0xmock_');
    expect(client.negotiateOrder).not.toHaveBeenCalled();
  });
});
