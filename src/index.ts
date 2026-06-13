/**
 * croo-core — Public API barrel export.
 *
 * Usage from any agent:
 * ```ts
 * import { makeClient, runProvider, hire, isMockMode, EventType } from 'croo-core';
 * ```
 */

// Client factory
export { makeClient, DEFAULT_CONFIG } from './client.js';

// Provider loop
export { runProvider } from './provider.js';

// Requester hire helper
export { hire } from './hire.js';
export type { TraceEmitter } from './hire.js';

// Mock mode
export { isMockMode, resetMockState } from './mock.js';

// Runtime constants (kept in sync with @croo-network/sdk)
export { EventType, DeliverableType } from './types.js';

// Core abstractions
export type {
  CrooConfig,
  ProviderHandlers,
  Deliverable,
  HireRequest,
  HireResult,
  TraceEvent,
  TraceEventType,
  AuditEntry,
  MockConfig,
  EventTypeName,
} from './types.js';

// Re-exported SDK domain types (single import site for agents)
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
} from './types.js';
