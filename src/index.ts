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

// Types
export { EventType } from './types.js';
export type {
  CrooConfig,
  ProviderHandlers,
  NegotiationEvent,
  Order,
  OrderStatus,
  Deliverable,
  HireRequest,
  HireResult,
  TraceEvent,
  TraceEventType,
  AuditEntry,
  MockConfig,
  EventTypeName,
} from './types.js';
