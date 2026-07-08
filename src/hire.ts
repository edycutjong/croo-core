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

import type { AgentClient } from '@croo-network/sdk';
import type { HireRequest, HireResult, TraceEvent, Delivery } from './types.js';
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

  // Step 2: Wait for the provider to accept (→ on-chain createOrder).
  // The buyer-side WebSocket does NOT reliably receive order_created, so we
  // poll the negotiation over REST until an orderId appears (or it fails).
  const orderId = await pollForOrderId(client, negotiation.negotiationId, 60_000);

  // Step 3: Pay (escrow lock)
  trace?.({
    type: 'hire_paid',
    agent: agentName,
    timestamp: Date.now(),
    data: { orderId },
  });

  const payResult = await client.payOrder(orderId);

  // Step 4: Wait for delivery. Poll the order status over REST (buyer-side
  // completion events are not reliably delivered over the WebSocket).
  const finalOrder = await pollForOrderCompletion(client, orderId, 300_000);

  // Step 5: Fetch the delivery
  const delivery = await client.getDelivery(orderId);
  const durationMs = Date.now() - startMs;

  // amountPaid as a human USDC decimal. The order price comes back in base
  // units (6-decimal USDC, e.g. "100000" = 0.1); payResult.order.price is often
  // empty right after payment, so prefer the settled order from the poll.
  const priceRaw = (finalOrder as any)?.price ?? payResult.order?.price;
  const amountPaid = priceRaw ? toUsdcDecimal(String(priceRaw)) : undefined;

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
    amountPaid,
    durationMs,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Normalize a CROO order price into a human USDC decimal string.
 * Integer inputs are treated as 6-decimal USDC base units ("100000" → "0.1").
 * Already-decimal inputs are passed through; empty/garbage → "0".
 */
function toUsdcDecimal(raw: string | undefined): string {
  const s = String(raw).trim();
  if (s.includes('.')) return s; // already a decimal amount
  try {
    const n = BigInt(s);
    const whole = n / 1_000_000n;
    const frac = (n % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
    return frac ? `${whole}.${frac}` : `${whole}`;
  } catch {
    return '0';
  }
}

/**
 * Poll a negotiation until the provider accepts it and an order exists.
 * Returns the orderId. Throws on rejection, expiry, or timeout.
 *
 * This replaces waiting for the WebSocket `order_created` event, which the
 * CROO backend does not reliably push to the requester's connection.
 */
async function pollForOrderId(
  client: AgentClient,
  negotiationId: string,
  timeoutMs: number,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  // Phase 1: wait for the provider to accept (negotiation gains an orderId).
  let orderId: string | undefined;
  while (Date.now() < deadline) {
    const neg = (await client.getNegotiation(negotiationId)) as any;
    const status = neg?.status;
    if (status === 'rejected') throw new Error('NEGOTIATION_REJECTED');
    if (status === 'expired') throw new Error('NEGOTIATION_EXPIRED');
    if (neg?.orderId) {
      orderId = neg.orderId as string;
      break;
    }
    await sleep(1_500);
  }
  if (!orderId) {
    throw new Error(`Timeout waiting for negotiation ${negotiationId} to be accepted after ${timeoutMs}ms`);
  }

  // Phase 2: wait for the on-chain createOrder to finalize (status → 'created')
  // so the order is payable. It starts life as 'creating' while the tx mines.
  while (Date.now() < deadline) {
    const order = (await client.getOrder(orderId)) as any;
    const status = order?.status;
    if (status === 'created') return orderId;
    if (status === 'rejected' || status === 'rejecting' || status === 'expired' || status === 'create_failed') {
      throw new Error(`ORDER_NOT_PAYABLE:${status}`);
    }
    await sleep(1_500);
  }
  throw new Error(`Timeout waiting for order ${orderId} to reach 'created' after ${timeoutMs}ms`);
}

/**
 * Poll an order until it is delivered/completed. Throws on any terminal
 * failure status or timeout. Replaces the buyer-side WebSocket completion wait.
 */
async function pollForOrderCompletion(
  client: AgentClient,
  orderId: string,
  timeoutMs: number,
): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const order = (await client.getOrder(orderId)) as any;
    const status = order?.status;
    // 'evaluating' = provider has delivered on-chain (deliverable is fetchable);
    // it auto-advances to 'completed'. Treat it as done so the requester can
    // pull the delivery without waiting on the post-delivery evaluation window.
    if (status === 'completed' || status === 'evaluating') return order;
    if (status === 'rejected' || status === 'rejecting') throw new Error('ORDER_REJECTED');
    if (status === 'expired') throw new Error('ORDER_EXPIRED');
    if (status === 'create_failed' || status === 'pay_failed' || status === 'deliver_failed') {
      throw new Error(`ORDER_FAILED:${status}`);
    }
    await sleep(2_000);
  }
  throw new Error(`Timeout waiting for order ${orderId} completion after ${timeoutMs}ms`);
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
