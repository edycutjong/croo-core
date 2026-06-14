/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * croo-core/hire — Sequential requester helper.
 *
 * Used by Maestro (hires Worker, Litmus, Summon) and Gauntlet (hires the
 * target agent under test). Opens a WebSocket, negotiates, pays, waits for
 * delivery, and returns the result.
 *
 * CRITICAL: hire() calls MUST be awaited sequentially. Parallel payOrder
 * calls from the same AA wallet cause nonce collisions on the Base mainnet
 * bundler (CROO FAQ confirmed).
 */

import type { AgentClient, EventStream } from '@croo-network/sdk';
import type { HireRequest, HireResult, TraceEvent, Event, Delivery } from './types.js';
import { EventType } from './types.js';
import { isMockMode, mockHire } from './mock.js';

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

  const stream = await (client as any).getSharedStream();
  try {
    // Step 1: Negotiate (requirements are sent as a JSON string)
    trace?.({
      type: 'hire_start',
      agent: agentName,
      timestamp: Date.now(),
      data: { serviceId: request.serviceId },
    });

    const negotiation = await client.negotiateOrder({
      serviceId: request.serviceId,
      requirements: JSON.stringify(request.requirement),
    });

    // Step 2: Wait for order_created (provider accepted → on-chain createOrder)
    const created = await waitForEvent(
      stream,
      EventType.OrderCreated,
      (e) => e.negotiation_id === negotiation.negotiationId,
      30_000, // 30s timeout for acceptance
    );
    const orderId = created.order_id;
    if (!orderId) {
      throw new Error('order_created event arrived without an order_id');
    }

    // Step 3: Pay (escrow lock)
    trace?.({
      type: 'hire_paid',
      agent: agentName,
      timestamp: Date.now(),
      data: { orderId },
    });

    const payResult = await client.payOrder(orderId);

    // Step 4: Wait for order_completed (provider delivered)
    await waitForEvent(
      stream,
      EventType.OrderCompleted,
      (e) => e.order_id === orderId,
      300_000, // 5min timeout for delivery
    );

    // Step 5: Fetch the delivery
    const delivery = await client.getDelivery(orderId);
    const durationMs = Date.now() - startMs;

    trace?.({
      type: 'hire_delivered',
      agent: agentName,
      timestamp: Date.now(),
      data: { orderId, durationMs, txHash: payResult.txHash },
    });

    return {
      orderId,
      delivery: parseDelivery<T>(delivery),
      txHash: payResult.txHash,
      amountPaid: payResult.order?.price,
      durationMs,
    };
  } finally {
    // Stream is now managed by the client as a singleton
  }
}

/**
 * Wait for a specific WebSocket event matching a predicate.
 * Times out with a clear error if the event never arrives.
 */
function waitForEvent(
  stream: EventStream,
  eventType: string,
  predicate: (event: Event) => boolean,
  timeoutMs: number,
): Promise<Event> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for ${eventType} after ${timeoutMs}ms`));
    }, timeoutMs);

    const handler = (event: Event) => {
      if (predicate(event)) {
        clearTimeout(timer);
        cleanup();
        resolve(event);
      }
    };

    stream.on(eventType, handler);

    function cleanup() {
      const s = stream as any;
      if (typeof s.off === 'function') s.off(eventType, handler);
      else if (typeof s.removeListener === 'function') s.removeListener(eventType, handler);
    }
  });
}

/**
 * Extract the delivered payload from an SDK `Delivery`.
 * `schema` deliverables are JSON-parsed; `text` is returned as-is.
 */
function parseDelivery<T>(delivery: Delivery): T {
  if (delivery.deliverableType === 'schema' && delivery.deliverableSchema) {
    try {
      return JSON.parse(delivery.deliverableSchema) as T;
    } catch {
      return delivery.deliverableSchema as unknown as T;
    }
  }
  return delivery.deliverableText as unknown as T;
}
