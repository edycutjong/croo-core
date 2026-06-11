/**
 * croo-core — Shared types for the Constellation agent suite.
 *
 * All types are derived from the verified CROO SDK surface
 * (see CROO_VERIFIED_APIS.md). Do NOT invent types — if it's
 * not documented in the SDK reference, it doesn't exist.
 */

// ─── SDK Re-exports (type-level) ───────────────────────────────────

/**
 * Configuration for the CROO AgentClient.
 * Base Mainnet (chain 8453), gas sponsored by CROO Paymaster.
 */
export interface CrooConfig {
  baseURL: string;   // 'https://api.croo.network'
  wsURL: string;     // 'wss://api.croo.network/ws'
  rpcURL?: string;   // 'https://mainnet.base.org' (optional, defaults)
  logger?: Console;
}

// ─── Provider Types ────────────────────────────────────────────────

export interface ProviderHandlers<TInput = unknown, TOutput = unknown> {
  /** Filter: return true if this negotiation should be accepted. */
  serviceMatch: (event: NegotiationEvent) => boolean;

  /** The actual work function. Receives parsed order, returns deliverable. */
  work: (order: Order<TInput>) => Promise<Deliverable<TOutput>>;

  /** Milliseconds before SLA to fire a safety rejectOrder. Default 60_000 (60s). */
  slaGuardMs?: number;
}

export interface NegotiationEvent {
  type: string;
  negotiation_id: string;
  service_id?: string;
  [key: string]: unknown;
}

export interface Order<T = unknown> {
  id: string;
  status: OrderStatus;
  service_id: string;
  amount?: string;
  sla_minutes?: number;
  requirement?: T;
  created_at?: string;
  paid_at?: string;
  [key: string]: unknown;
}

export type OrderStatus =
  | 'created'
  | 'paid'
  | 'completed'
  | 'rejected'
  | 'expired';

export interface Deliverable<T = unknown> {
  type: 'text' | 'schema';
  data: T;
}

// ─── Hire (Requester) Types ────────────────────────────────────────

export interface HireRequest {
  serviceId: string;
  requirement: Record<string, unknown>;
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

// ─── WebSocket Events (from SDK reference) ─────────────────────────

export const EventType = {
  NegotiationCreated: 'negotiation_created',
  NegotiationRejected: 'negotiation_rejected',
  NegotiationExpired: 'negotiation_expired',
  OrderCreated: 'order_created',
  OrderPaid: 'order_paid',
  OrderCompleted: 'order_completed',
  OrderRejected: 'order_rejected',
  OrderExpired: 'order_expired',
} as const;

export type EventTypeName = (typeof EventType)[keyof typeof EventType];
