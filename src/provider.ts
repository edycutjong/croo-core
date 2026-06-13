/**
 * croo-core/provider — Reusable provider loop for all agents.
 *
 * Connects a WebSocket, auto-accepts matching negotiations, runs the work
 * function on order_paid, and delivers the result. Includes SLA-safety:
 * rejectOrder fires ~60s before the SLA deadline so the buyer gets a clean
 * refund instead of a stuck escrow.
 *
 * Used by: Summon, Litmus, Gauntlet, Goldilocks, and Maestro (provider side).
 */

import type { AgentClient } from '@croo-network/sdk';
import type {
  ProviderHandlers,
  Event,
  Order,
  Deliverable,
  DeliverOrderRequest,
} from './types.js';
import { EventType, DeliverableType } from './types.js';
import { isMockMode, mockProvider } from './mock.js';

/**
 * Start a provider loop that listens for negotiations and processes orders.
 *
 * @param client - An initialized AgentClient (from `makeClient`)
 * @param handlers - serviceMatch, work, and optional slaGuardMs
 * @returns The WebSocket stream (for graceful shutdown)
 */
export async function runProvider<TOutput = unknown>(
  client: AgentClient,
  handlers: ProviderHandlers<TOutput>,
) {
  // ── Mock mode: return a fake stream that can be closed ──
  if (isMockMode()) {
    return mockProvider(handlers);
  }

  const { serviceMatch, work, slaGuardMs = 60_000 } = handlers;

  const stream = await client.connectWebSocket();

  // ── Accept matching negotiations ──
  stream.on(EventType.NegotiationCreated, async (event: Event) => {
    if (!event.negotiation_id || !serviceMatch(event)) return;

    try {
      await client.acceptNegotiation(event.negotiation_id);
      console.log(`[provider] Accepted negotiation ${event.negotiation_id}`);
    } catch (err) {
      console.error(`[provider] Failed to accept ${event.negotiation_id}:`, err);
    }
  });

  // ── Process paid orders ──
  stream.on(EventType.OrderPaid, async (event: Event) => {
    if (!event.order_id) return;

    const order = await client.getOrder(event.order_id);
    console.log(`[provider] Order paid: ${order.orderId}, starting work...`);

    // SLA safety timer: reject before deadline to trigger clean refund
    const slaTimer = scheduleSlaGuard(client, order, slaGuardMs);

    try {
      const deliverable = await work(order);
      await client.deliverOrder(order.orderId, toDeliverRequest(deliverable));
      console.log(`[provider] Delivered order ${order.orderId}`);
    } catch (err) {
      console.error(`[provider] Work failed for order ${order.orderId}:`, err);
      try {
        await client.rejectOrder(order.orderId, String(err));
        console.log(`[provider] Rejected order ${order.orderId} (clean refund)`);
      } catch (rejectErr) {
        console.error(`[provider] Failed to reject order ${order.orderId}:`, rejectErr);
      }
    } finally {
      clearTimeout(slaTimer);
    }
  });

  console.log('[provider] WebSocket connected, listening for negotiations...');
  return stream;
}

/**
 * Map a core `Deliverable` to the SDK's `DeliverOrderRequest`.
 * `text` -> deliverableText, `schema` -> deliverableSchema (JSON-stringified).
 */
function toDeliverRequest(d: Deliverable): DeliverOrderRequest {
  const payload = typeof d.data === 'string' ? d.data : JSON.stringify(d.data);
  return d.type === 'schema'
    ? { deliverableType: DeliverableType.Schema, deliverableSchema: payload }
    : { deliverableType: DeliverableType.Text, deliverableText: payload };
}

/**
 * Schedule an automatic rejectOrder before the SLA expires.
 * Ensures the buyer gets a clean refund instead of a stuck escrow.
 */
function scheduleSlaGuard(
  client: AgentClient,
  order: Order,
  guardMs: number,
): NodeJS.Timeout {
  const deadline = order.slaDeadline
    ? new Date(order.slaDeadline).getTime()
    : Date.now() + 15 * 60 * 1000; // fall back to 15 min if absent
  const triggerAt = deadline - guardMs;
  const delayMs = Math.max(triggerAt - Date.now(), 1000); // At least 1s

  return setTimeout(async () => {
    try {
      console.warn(
        `[provider] SLA guard firing for order ${order.orderId} — rejecting to refund buyer`,
      );
      await client.rejectOrder(order.orderId, 'SLA guard: approaching deadline, clean refund');
    } catch (_err) {
      // Order may have already been delivered/rejected — safe to ignore
    }
  }, delayMs);
}
