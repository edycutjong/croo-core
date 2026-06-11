/**
 * croo-core/provider — Reusable provider loop for all agents.
 *
 * Connects a WebSocket, auto-accepts matching negotiations,
 * runs the work function on order_paid, and delivers the result.
 * Includes SLA-safety: rejectOrder fires ~60s before the SLA
 * deadline so the buyer gets a clean refund instead of a stuck escrow.
 *
 * Used by: Summon, Litmus, Gauntlet, and Maestro (provider side).
 */

import type {
  ProviderHandlers,
  NegotiationEvent,
  Order,
  Deliverable,
} from './types.js';
import { EventType } from './types.js';
import { isMockMode, mockProvider } from './mock.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AgentClient = any;

/**
 * Start a provider loop that listens for negotiations and processes orders.
 *
 * @param client - An initialized AgentClient (from `makeClient`)
 * @param handlers - serviceMatch, work, and optional slaGuardMs
 * @returns The WebSocket stream (for graceful shutdown)
 */
export async function runProvider<TInput = unknown, TOutput = unknown>(
  client: AgentClient,
  handlers: ProviderHandlers<TInput, TOutput>,
) {
  // ── Mock mode: return a fake stream that can be closed ──
  if (isMockMode()) {
    return mockProvider(handlers);
  }

  const { serviceMatch, work, slaGuardMs = 60_000 } = handlers;

  const stream = await client.connectWebSocket();

  // ── Accept matching negotiations ──
  stream.on(EventType.NegotiationCreated, async (event: NegotiationEvent) => {
    if (!serviceMatch(event)) return;

    try {
      await client.acceptNegotiation(event.negotiation_id);
      console.log(`[provider] Accepted negotiation ${event.negotiation_id}`);
    } catch (err) {
      console.error(`[provider] Failed to accept ${event.negotiation_id}:`, err);
    }
  });

  // ── Process paid orders ──
  stream.on(EventType.OrderPaid, async (event: { order_id: string }) => {
    const order: Order<TInput> = await client.getOrder(event.order_id);
    console.log(`[provider] Order paid: ${order.id}, starting work...`);

    // SLA safety timer: reject before deadline to trigger clean refund
    const slaTimer = scheduleSlaGuard(client, order, slaGuardMs);

    try {
      const deliverable: Deliverable<TOutput> = await work(order);
      await client.deliverOrder(order.id, deliverable);
      console.log(`[provider] Delivered order ${order.id}`);
    } catch (err) {
      console.error(`[provider] Work failed for order ${order.id}:`, err);
      try {
        await client.rejectOrder(order.id, String(err));
        console.log(`[provider] Rejected order ${order.id} (clean refund)`);
      } catch (rejectErr) {
        console.error(`[provider] Failed to reject order ${order.id}:`, rejectErr);
      }
    } finally {
      clearTimeout(slaTimer);
    }
  });

  console.log('[provider] WebSocket connected, listening for negotiations...');
  return stream;
}

/**
 * Schedule an automatic rejectOrder before the SLA expires.
 * This ensures the buyer gets a clean refund instead of a stuck escrow.
 */
function scheduleSlaGuard(
  client: AgentClient,
  order: Order,
  guardMs: number,
): NodeJS.Timeout {
  const slaTotalMs = (order.sla_minutes ?? 15) * 60 * 1000;
  const paidAt = order.paid_at ? new Date(order.paid_at).getTime() : Date.now();
  const deadline = paidAt + slaTotalMs;
  const triggerAt = deadline - guardMs;
  const delayMs = Math.max(triggerAt - Date.now(), 1000); // At least 1s

  return setTimeout(async () => {
    try {
      console.warn(`[provider] SLA guard firing for order ${order.id} — rejecting to refund buyer`);
      await client.rejectOrder(order.id, 'SLA guard: approaching deadline, clean refund');
    } catch (_err) {
      // Order may have already been delivered/rejected — safe to ignore
    }
  }, delayMs);
}
