/**
 * croo-core — Shared types for the Constellation agent suite.
 *
 * Domain types (Order, Negotiation, Delivery, Event, ...) are imported
 * directly from @croo-network/sdk via `import type`, so they are ALWAYS in
 * sync with the installed SDK and are fully erased at runtime — mock mode
 * still works without the SDK installed.
 *
 * `EventType` / `DeliverableType` are kept as local runtime constants (the
 * SDK exposes them as values, and importing them would force a load-time SDK
 * dependency). A drift-guard test (types.test.ts) asserts these match the
 * SDK's values exactly, so they can never silently diverge again.
 */

import type {
  Order,
  Negotiation,
  Delivery,
  Event,
  PayOrderResult,
  DeliverOrderRequest,
  DeliverOrderResult,
  NegotiateOrderRequest,
  AcceptNegotiationResult,
  Logger,
} from '@croo-network/sdk';

// Re-export the SDK domain types so agents import them from one place.
export type {
  Order,
  Negotiation,
  Delivery,
  Event,
  PayOrderResult,
  DeliverOrderRequest,
  DeliverOrderResult,
  NegotiateOrderRequest,
  AcceptNegotiationResult,
  Logger,
};

// ─── CROO client config ────────────────────────────────────────────

/**
 * Configuration for the CROO AgentClient.
 * Base Mainnet (chain 8453), gas sponsored by CROO Paymaster.
 */
export interface CrooConfig {
  baseURL: string; // 'https://api.croo.network'
  wsURL: string; // 'wss://api.croo.network/ws'
  rpcURL?: string; // 'https://mainnet.base.org' (optional, defaults)
  logger?: Logger;
}

// ─── Provider handler contract ─────────────────────────────────────

export interface ProviderHandlers<TOutput = unknown> {
  /** Filter: return true if this negotiation should be accepted. */
  serviceMatch: (event: Event) => boolean;

  /** The work function. Receives the paid Order, returns a deliverable. */
  work: (order: Order) => Promise<Deliverable<TOutput>>;

  /** Milliseconds before the SLA deadline to fire a safety rejectOrder. Default 60_000 (60s). */
  slaGuardMs?: number;
}

/**
 * Work output. The provider loop maps this to the SDK's `DeliverOrderRequest`
 * (`text` -> deliverableText, `schema` -> deliverableSchema as JSON).
 */
export type Deliverable<T = unknown> =
  | { type: 'text'; data: string }
  | { type: 'schema'; data: T };

// ─── Hire (requester) ──────────────────────────────────────────────

export interface HireRequest<TReq = Record<string, unknown>> {
  serviceId: string;
  requirement: TReq;
  /** Maximum USDC to spend. If the service price exceeds this, reject. */
  maxPrice?: number;
}

export interface HireResult<T = unknown> {
  orderId: string;
  delivery: T;
  txHash?: string;
  amountPaid?: string;
  durationMs: number;
}

// ─── Trace (for Maestro's node-graph UI) ───────────────────────────

export type TraceEventType =
  | 'pipeline_start'
  | 'pipeline_resume'
  | 'hire_start'
  | 'hire_paid'
  | 'hire_delivered'
  | 'hire_failed'
  | 'gate_check'
  | 'gate_escalate'
  | 'compose_start'
  | 'compose_done'
  | 'pipeline_done'
  | 'pipeline_error';

export interface TraceEvent {
  type: TraceEventType;
  agent: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

// ─── Audit Trail ───────────────────────────────────────────────────

export interface AuditEntry {
  step: string;
  agent: string;
  orderId: string;
  amount: string;
  txHash?: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  startedAt: number;
  completedAt?: number;
}

// ─── Mock Mode ─────────────────────────────────────────────────────

export interface MockConfig {
  /** If true, all SDK calls return deterministic fixture data. No USDC spent. */
  enabled: boolean;
  /** Fixed delay (ms) to simulate network latency in mock mode. Default 500. */
  latencyMs?: number;
}

// ─── WebSocket events / deliverable kinds ──────────────────────────
//
// Local copies of the SDK's `EventType` / `DeliverableType` value constants.
// MUST stay byte-for-byte identical to @croo-network/sdk — enforced by the
// drift-guard test in __tests__/types.test.ts.

export const EventType = {
  NegotiationCreated: 'order_negotiation_created',
  NegotiationRejected: 'order_negotiation_rejected',
  NegotiationExpired: 'order_negotiation_expired',
  OrderCreated: 'order_created',
  OrderPaid: 'order_paid',
  OrderCompleted: 'order_completed',
  OrderRejected: 'order_rejected',
  OrderExpired: 'order_expired',
} as const;

export const DeliverableType = {
  Text: 'text',
  Schema: 'schema',
} as const;

export type EventTypeName = (typeof EventType)[keyof typeof EventType];
