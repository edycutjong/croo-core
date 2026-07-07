/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * croo-core/hire — edge cases of the REAL (non-mock) requester flow.
 *
 * hire.test.ts covers the happy path + mock mode. This file covers the
 * error/branch paths of the REST-polling flow: negotiation acceptance polling,
 * rejection/expiry, schema-delivery parsing (+ fallback), the acceptance
 * timeout, and the amountPaid optional chain — all with fake clients
 * (no network, no USDC, no WebSocket).
 *
 * NOTE: hire() polls getNegotiation()/getOrder() over REST rather than waiting
 * for WebSocket events, because the CROO backend does not reliably push
 * order_created / order_completed to the requester's socket.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hire } from '../src/hire.js';

/** Client that completes the flow, with configurable delivery + payResult. */
function fullClient(
  delivery: Record<string, unknown>,
  payResult: Record<string, unknown> = { txHash: 'tx', order: { price: '0.05' } },
  overrides: Record<string, unknown> = {},
) {
  let paid = false;
  return {
    negotiateOrder: vi.fn(async () => ({ negotiationId: 'neg_1' })),
    getNegotiation: vi.fn(async () => ({ status: 'accepted', orderId: 'ord_1' })),
    // 'created' (payable) before payment, 'completed' after.
    getOrder: vi.fn(async () => ({ status: paid ? 'completed' : 'created' })),
    payOrder: vi.fn(async () => {
      paid = true;
      return payResult;
    }),
    getDelivery: vi.fn(async () => delivery),
    ...overrides,
  };
}

describe('hire — real flow edge cases (REST polling)', () => {
  beforeEach(() => {
    delete process.env.CROO_MOCK; // force the real path
  });

  it('completes the happy path: negotiate → poll accept → pay → poll complete → deliver', async () => {
    const client = fullClient({ deliverableType: 'text', deliverableText: 'ok' });
    const result = await hire(client as any, { serviceId: 's', requirement: {} });
    expect(result.orderId).toBe('ord_1');
    expect(result.txHash).toBe('tx');
    expect(result.amountPaid).toBe('0.05');
    expect((client.getNegotiation as any)).toHaveBeenCalledWith('neg_1');
    expect((client.payOrder as any)).toHaveBeenCalledWith('ord_1');
  });

  it('JSON-parses a schema deliverable', async () => {
    const client = fullClient({ deliverableType: 'schema', deliverableSchema: '{"score":92}' });
    const result = await hire<{ score: number }>(client as any, { serviceId: 's', requirement: {} });
    expect(result.delivery).toEqual({ score: 92 });
  });

  it('falls back to the raw schema string when it is not valid JSON', async () => {
    const client = fullClient({ deliverableType: 'schema', deliverableSchema: 'not json' });
    const result = await hire(client as any, { serviceId: 's', requirement: {} });
    expect(result.delivery).toBe('not json');
  });

  it('uses deliverableText when a schema type carries no schema body', async () => {
    const client = fullClient({ deliverableType: 'schema', deliverableText: 'text fallback' });
    const result = await hire(client as any, { serviceId: 's', requirement: {} });
    expect(result.delivery).toBe('text fallback');
  });

  it('converts a base-units order price into a USDC decimal amountPaid', async () => {
    let paid = false;
    const client = {
      negotiateOrder: vi.fn(async () => ({ negotiationId: 'neg_1' })),
      getNegotiation: vi.fn(async () => ({ status: 'accepted', orderId: 'ord_1' })),
      // settled order reports price in 6-decimal USDC base units
      getOrder: vi.fn(async () => ({ status: paid ? 'completed' : 'created', price: '100000' })),
      payOrder: vi.fn(async () => {
        paid = true;
        return { txHash: 'tx', order: { price: '' } }; // empty on payResult, as seen live
      }),
      getDelivery: vi.fn(async () => ({ deliverableType: 'text', deliverableText: 'ok' })),
    };
    const result = await hire(client as any, { serviceId: 's', requirement: {} });
    expect(result.amountPaid).toBe('0.1');
  });

  it('returns undefined amountPaid when payResult has no order', async () => {
    const client = fullClient(
      { deliverableType: 'text', deliverableText: 'x' },
      { txHash: '0xonly' },
    );
    const result = await hire(client as any, { serviceId: 's', requirement: {} });
    expect(result.txHash).toBe('0xonly');
    expect(result.amountPaid).toBeUndefined();
  });

  it('throws NEGOTIATION_REJECTED when the provider rejects the negotiation', async () => {
    const client = fullClient(
      { deliverableType: 'text', deliverableText: 'x' },
      undefined,
      { getNegotiation: vi.fn(async () => ({ status: 'rejected' })) },
    );
    await expect(hire(client as any, { serviceId: 's', requirement: {} })).rejects.toThrow(
      'NEGOTIATION_REJECTED',
    );
  });

  it('throws ORDER_NOT_PAYABLE when the order is rejected before it becomes payable', async () => {
    const client = fullClient(
      { deliverableType: 'text', deliverableText: 'x' },
      undefined,
      { getOrder: vi.fn(async () => ({ status: 'rejected' })) },
    );
    await expect(hire(client as any, { serviceId: 's', requirement: {} })).rejects.toThrow(
      'ORDER_NOT_PAYABLE',
    );
  });

  it('polls through a pending negotiation until it is accepted', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const client = fullClient(
        { deliverableType: 'text', deliverableText: 'ok' },
        undefined,
        {
          getNegotiation: vi.fn(async () => {
            calls += 1;
            return calls === 1 ? { status: 'pending' } : { status: 'accepted', orderId: 'ord_1' };
          }),
        },
      );
      const promise = hire(client as any, { serviceId: 's', requirement: {} });
      await vi.advanceTimersByTimeAsync(2_000); // flush the 1.5s poll gap
      const result = await promise;
      expect(result.orderId).toBe('ord_1');
      expect(calls).toBeGreaterThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('times out when the negotiation is never accepted', async () => {
    vi.useFakeTimers();
    try {
      const client = {
        negotiateOrder: vi.fn(async () => ({ negotiationId: 'neg_1' })),
        getNegotiation: vi.fn(async () => ({ status: 'pending' })), // never accepted
      };
      const promise = hire(client as any, { serviceId: 's', requirement: {} });
      const assertion = expect(promise).rejects.toThrow('Timeout waiting for negotiation');
      await vi.advanceTimersByTimeAsync(61_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
