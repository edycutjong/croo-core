/**
 * croo-core/hire — Sequential requester helper.
 *
 * Used by Maestro (hires Worker, Litmus, Summon) and Gauntlet
 * (hires the target agent under test).
 *
 * CRITICAL: hire() calls MUST be awaited sequentially.
 * Parallel payOrder calls from the same AA wallet cause nonce
 * collisions on the Base mainnet bundler (CROO FAQ confirmed).
 */

import type { HireRequest, HireResult, TraceEvent } from './types.js';
import { EventType } from './types.js';
import { isMockMode, mockHire } from './mock.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AgentClient = any;

/** Callback for emitting trace events (used by Maestro's node-graph UI). */
export type TraceEmitter = (event: TraceEvent) => void;

/**
 * Hire a service: negotiate → wait for order → pay → wait for delivery.
 *
 * This is the requester-side flow. It is BLOCKING and SEQUENTIAL by design.
 * Never call multiple hire() in parallel from the same wallet.
 *
 * @param client - An initialized AgentClient
 * @param request - { serviceId, requirement, maxPrice? }
 * @param trace - Optional trace emitter for the live node-graph
 * @returns The delivery result with timing and tx info
 */
export async function hire<T = unknown>(
  client: AgentClient,
  request: HireRequest,
  trace?: TraceEmitter,
): Promise<HireResult<T>> {
  // ── Mock mode ──
  if (isMockMode()) {
    return mockHire<T>(request, trace);
  }

  const startMs = Date.now();
  const agentName = request.serviceId.slice(0, 12) + '...';

  // Step 1: Negotiate
  trace?.({
    type: 'hire_start',
    agent: agentName,
    timestamp: Date.now(),
    data: { serviceId: request.serviceId },
  });

  const negotiation = await client.negotiateOrder({
    serviceId: request.serviceId,
    ...request.requirement,
  });

  // Step 2: Wait for order_created (provider accepted)
  const order = await waitForEvent(
    client,
    EventType.OrderCreated,
    (e: { negotiation_id?: string }) => e.negotiation_id === negotiation.id,
    30_000, // 30s timeout for acceptance
  );

  // Step 3: Pay (escrow lock)
  trace?.({
    type: 'hire_paid',
    agent: agentName,
    timestamp: Date.now(),
    data: { orderId: order.id },
  });

  const payResult = await client.payOrder(order.id);

  // Step 4: Wait for order_completed (provider delivered)
  await waitForEvent(
    client,
    EventType.OrderCompleted,
    (e: { order_id?: string }) => e.order_id === order.id,
    300_000, // 5min timeout for delivery
  );

  // Step 5: Get the delivery
  const delivery = await client.getDelivery(order.id);

  const durationMs = Date.now() - startMs;

  trace?.({
    type: 'hire_delivered',
    agent: agentName,
    timestamp: Date.now(),
    data: {
      orderId: order.id,
      durationMs,
      txHash: payResult?.txHash,
    },
  });

  return {
    orderId: order.id,
    delivery: delivery?.data as T,
    txHash: payResult?.txHash,
    amountPaid: payResult?.amount,
    durationMs,
  };
}

/**
 * Wait for a specific WebSocket event matching a predicate.
 * Times out with a clear error if the event never arrives.
 */
async function waitForEvent(
  client: AgentClient,
  eventType: string,
  predicate: (event: Record<string, unknown>) => boolean,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for ${eventType} after ${timeoutMs}ms`));
    }, timeoutMs);

    // This assumes the client already has an active WebSocket connection.
    // In practice, the provider loop or a separate connectWebSocket() call
    // must be active. We listen on the existing stream.
    const handler = (event: Record<string, unknown>) => {
      if (predicate(event)) {
        clearTimeout(timer);
        resolve(event);
      }
    };

    // Attach a one-time listener. The actual API may vary —
    // adapt once we have the real SDK installed.
    if (client._wsStream) {
      client._wsStream.on(eventType, handler);
    } else {
      // Fallback: poll getOrder until status changes
      pollForStatus(client, eventType, predicate, timeoutMs)
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    }
  });
}

/**
 * Fallback polling when no active WebSocket stream is available.
 * Polls every 2 seconds until the expected status is reached.
 */
async function pollForStatus(
  client: AgentClient,
  eventType: string,
  predicate: (event: Record<string, unknown>) => boolean,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const start = Date.now();
  const pollInterval = 2000;

  while (Date.now() - start < timeoutMs) {
    // List recent orders and check for status match
    const orders = await client.listOrders({ page: 1, pageSize: 10 });
    for (const order of orders ?? []) {
      const fakeEvent = { ...order, order_id: order.id, negotiation_id: order.negotiation_id };
      if (predicate(fakeEvent)) {
        return fakeEvent;
      }
    }
    await sleep(pollInterval);
  }

  throw new Error(`Polling timeout for ${eventType} after ${timeoutMs}ms`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
