/**
 * croo-core/mock — Deterministic mock mode for offline development and CI.
 *
 * When CROO_MOCK=true, all SDK calls return fixture data.
 * No USDC is spent, no WebSocket is opened, no mainnet calls are made.
 * This lets you develop and test the full pipeline without funding.
 */

import type {
  ProviderHandlers,
  HireRequest,
  HireResult,
  Order,
  Deliverable,
} from './types.js';
import type { TraceEmitter } from './hire.js';

// ─── Mode Detection ────────────────────────────────────────────────

/** Check if mock mode is enabled via environment variable. */
export function isMockMode(): boolean {
  return process.env.CROO_MOCK === 'true';
}

/** Default simulated latency in mock mode (ms). */
const MOCK_LATENCY = Number(process.env.CROO_MOCK_LATENCY) || 500;

// ─── Mock Provider ─────────────────────────────────────────────────

export interface MockStream {
  close: () => void;
  /** Simulate an incoming paid order (for testing). */
  simulateOrder: (order: Partial<Order>) => Promise<void>;
}

/**
 * Mock provider loop. Returns a fake stream with a simulateOrder method
 * for testing the work function without a real WebSocket.
 */
export async function mockProvider<TOutput>(
  handlers: ProviderHandlers<TOutput>,
): Promise<MockStream> {
  console.log('[mock] Provider started in mock mode — no WebSocket connection');

  const stream: MockStream = {
    close: () => console.log('[mock] Provider stream closed'),
    simulateOrder: async (partial: Partial<Order>) => {
      const now = new Date().toISOString();
      // Minimal SDK-shaped Order — only the fields the work function reads.
      const order = {
        orderId: partial.orderId ?? `mock_order_${Date.now()}`,
        negotiationId: partial.negotiationId ?? 'mock_neg',
        serviceId: partial.serviceId ?? 'mock_service',
        price: partial.price ?? '0.01',
        status: 'paid',
        deliveryWindow: partial.deliveryWindow ?? 900,
        slaDeadline:
          partial.slaDeadline ?? new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        createdAt: now,
        paidAt: now,
        ...partial,
      } as Order;

      await sleep(MOCK_LATENCY);

      try {
        const result: Deliverable<TOutput> = await handlers.work(order);
        console.log(`[mock] Work completed for order ${order.orderId}:`, result.type);
      } catch (err) {
        console.error(`[mock] Work failed for order ${order.orderId}:`, err);
      }
    },
  };

  return stream;
}

// ─── Mock Hire ─────────────────────────────────────────────────────

/** Counter for deterministic mock order IDs. */
let mockOrderCounter = 0;

/** Deterministic mock delivery data keyed by service keyword. */
const MOCK_DELIVERIES: Record<string, unknown> = {
  research: {
    draft: 'Mock research draft for $XYZ token. This is a placeholder that Litmus will grade.',
    sources: ['https://example.com/source1', 'https://example.com/source2'],
  },
  grade: {
    score: 62,
    grade: 'C',
    rubric: [
      { criterion: 'Factual accuracy', score: 55, weight: 0.3 },
      { criterion: 'Source citations', score: 40, weight: 0.25 },
      { criterion: 'Completeness', score: 70, weight: 0.2 },
      { criterion: 'Coherence', score: 80, weight: 0.15 },
      { criterion: 'Actionability', score: 65, weight: 0.1 },
    ],
    gaps: ['No primary sources cited', 'Missing risk section'],
    confidence: 'medium',
  },
  'human': {
    approved: true,
    by: 'operator@telegram',
    ms: 3200,
  },
  certify: {
    target: 'mock_service',
    score: 92,
    grade: 'A',
    refundSafe: true,
    p50Ms: 4200,
    p95Ms: 9100,
    probes: [
      { name: 'happy', pass: true, ms: 3900 },
      { name: 'malformedSchema', pass: true, note: 'rejected cleanly' },
      { name: 'slaSafety', pass: true, note: 'provider rejected at SLA-58s' },
    ],
  },
};

/**
 * Mock hire: returns deterministic fixture data after a simulated delay.
 */
export async function mockHire<T>(
  request: HireRequest,
  trace?: TraceEmitter,
): Promise<HireResult<T>> {
  const startMs = Date.now();
  const agentName = request.serviceId.slice(0, 12) + '...';
  const orderId = `mock_order_${++mockOrderCounter}`;

  trace?.({
    type: 'hire_start',
    agent: agentName,
    timestamp: Date.now(),
    data: { serviceId: request.serviceId },
  });

  await sleep(MOCK_LATENCY);

  trace?.({
    type: 'hire_paid',
    agent: agentName,
    timestamp: Date.now(),
    data: { orderId },
  });

  await sleep(MOCK_LATENCY);

  // Match delivery data by service keyword
  const serviceKey = Object.keys(MOCK_DELIVERIES).find(
    (key) => request.serviceId.toLowerCase().includes(key),
  );
  // `find` only ever returns a key that exists in MOCK_DELIVERIES, and the
  // 'research' fallback is always present, so the lookup is never undefined.
  const delivery = MOCK_DELIVERIES[serviceKey ?? 'research'];

  const durationMs = Date.now() - startMs;

  trace?.({
    type: 'hire_delivered',
    agent: agentName,
    timestamp: Date.now(),
    data: { orderId, durationMs, txHash: `0xmock_${orderId}` },
  });

  return {
    orderId: orderId as string,
    delivery: delivery as T,
    txHash: `0xmock_${orderId}`,
    amountPaid: '0.01',
    durationMs,
  };
}

/**
 * Reset mock state (for testing).
 */
export function resetMockState(): void {
  mockOrderCounter = 0;
}

// ─── Utility ───────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
