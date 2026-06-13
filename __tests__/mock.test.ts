/**
 * croo-core/mock — Tests for the deterministic mock system.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isMockMode, resetMockState } from '../src/mock.js';
import { mockHire, mockProvider } from '../src/mock.js';
import type { ProviderHandlers, HireRequest } from '../src/types.js';

describe('isMockMode', () => {
  const originalEnv = process.env.CROO_MOCK;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CROO_MOCK;
    } else {
      process.env.CROO_MOCK = originalEnv;
    }
  });

  it('returns false when CROO_MOCK is not set', () => {
    delete process.env.CROO_MOCK;
    expect(isMockMode()).toBe(false);
  });

  it('returns true when CROO_MOCK is "true"', () => {
    process.env.CROO_MOCK = 'true';
    expect(isMockMode()).toBe(true);
  });

  it('returns false when CROO_MOCK is "false"', () => {
    process.env.CROO_MOCK = 'false';
    expect(isMockMode()).toBe(false);
  });

  it('returns false when CROO_MOCK is "1"', () => {
    process.env.CROO_MOCK = '1';
    expect(isMockMode()).toBe(false);
  });
});

describe('mockHire', () => {
  beforeEach(() => {
    resetMockState();
    process.env.CROO_MOCK_LATENCY = '10'; // Fast tests
  });

  afterEach(() => {
    delete process.env.CROO_MOCK_LATENCY;
  });

  it('returns a HireResult with deterministic order ID', async () => {
    const request: HireRequest = {
      serviceId: 'svc_research_agent',
      requirement: { topic: 'test' },
    };

    const result = await mockHire(request);

    expect(result.orderId).toBe('mock_order_1');
    expect(result.txHash).toContain('0xmock_');
    expect(result.amountPaid).toBe('0.01');
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it('returns research delivery for service IDs containing "research"', async () => {
    const request: HireRequest = {
      serviceId: 'svc_research_worker',
      requirement: { topic: 'test' },
    };

    const result = await mockHire<{ draft: string }>(request);

    expect(result.delivery.draft).toContain('Mock research draft');
  });

  it('returns grade delivery for service IDs containing "grade"', async () => {
    const request: HireRequest = {
      serviceId: 'svc_grade_litmus',
      requirement: { deliverable: 'test text' },
    };

    const result = await mockHire<{ score: number }>(request);

    expect(result.delivery.score).toBe(62);
  });

  it('returns human approval for service IDs containing "human"', async () => {
    const request: HireRequest = {
      serviceId: 'svc_human_summon',
      requirement: { prompt: 'Approve?' },
    };

    const result = await mockHire<{ approved: boolean }>(request);

    expect(result.delivery.approved).toBe(true);
  });

  it('increments order IDs sequentially', async () => {
    const request: HireRequest = {
      serviceId: 'svc_test',
      requirement: {},
    };

    const r1 = await mockHire(request);
    const r2 = await mockHire(request);

    expect(r1.orderId).toBe('mock_order_1');
    expect(r2.orderId).toBe('mock_order_2');
  });

  it('emits trace events when trace emitter is provided', async () => {
    const events: Array<{ type: string }> = [];
    const trace = (e: { type: string }) => events.push(e);

    const request: HireRequest = {
      serviceId: 'svc_research_test',
      requirement: { topic: 'test' },
    };

    await mockHire(request, trace);

    expect(events.length).toBe(3);
    expect(events[0].type).toBe('hire_start');
    expect(events[1].type).toBe('hire_paid');
    expect(events[2].type).toBe('hire_delivered');
  });

  it('does not emit trace events when no emitter provided', async () => {
    // Should not throw
    const request: HireRequest = {
      serviceId: 'svc_test',
      requirement: {},
    };

    const result = await mockHire(request);
    expect(result.orderId).toBeDefined();
  });

  it('falls back to the research fixture for an unrecognized serviceId', async () => {
    const result = await mockHire<{ draft: string }>({
      serviceId: 'svc_unmatched_xyz',
      requirement: {},
    });
    expect(result.delivery.draft).toContain('Mock research draft');
  });
});

describe('resetMockState', () => {
  beforeEach(() => {
    process.env.CROO_MOCK_LATENCY = '10';
  });

  afterEach(() => {
    delete process.env.CROO_MOCK_LATENCY;
  });

  it('resets the order counter', async () => {
    const request: HireRequest = {
      serviceId: 'svc_test',
      requirement: {},
    };

    await mockHire(request);
    await mockHire(request);
    resetMockState();

    const result = await mockHire(request);
    expect(result.orderId).toBe('mock_order_1');
  });
});

describe('mockProvider', () => {
  beforeEach(() => {
    process.env.CROO_MOCK_LATENCY = '10';
  });

  afterEach(() => {
    delete process.env.CROO_MOCK_LATENCY;
  });

  it('returns a stream with close and simulateOrder methods', async () => {
    const handlers: ProviderHandlers = {
      serviceMatch: () => true,
      work: async () => ({ type: 'text', data: 'ok' }),
    };

    const stream = await mockProvider(handlers);

    expect(stream).toBeDefined();
    expect(typeof stream.close).toBe('function');
    expect(typeof stream.simulateOrder).toBe('function');
    expect(() => stream.close()).not.toThrow();
  });

  it('simulateOrder auto-generates an order id when none is provided', async () => {
    const workFn = vi.fn().mockResolvedValue({ type: 'text', data: 'x' });
    const stream = await mockProvider({ serviceMatch: () => true, work: workFn });

    await stream.simulateOrder({}); // no id → falls back to mock_order_<timestamp>

    expect(workFn).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: expect.stringMatching(/^mock_order_/), status: 'paid' }),
    );
  });

  it('simulateOrder calls the work function', async () => {
    const workFn = vi.fn().mockResolvedValue({ type: 'text', data: 'result' });

    const handlers: ProviderHandlers = {
      serviceMatch: () => true,
      work: workFn,
    };

    const stream = await mockProvider(handlers);
    await stream.simulateOrder({ orderId: 'test_order_1' });

    expect(workFn).toHaveBeenCalledTimes(1);
    expect(workFn).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'test_order_1', status: 'paid' }),
    );
  });

  it('handles work function errors gracefully', async () => {
    const workFn = vi.fn().mockRejectedValue(new Error('work failed'));

    const handlers: ProviderHandlers = {
      serviceMatch: () => true,
      work: workFn,
    };

    const stream = await mockProvider(handlers);
    // Should not throw
    await stream.simulateOrder({ orderId: 'fail_order' });
    expect(workFn).toHaveBeenCalledTimes(1);
  });
});
