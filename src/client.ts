/**
 * croo-core/client — Factory for the CROO AgentClient.
 *
 * Centralizes configuration so every agent in the constellation
 * uses the same baseURL / wsURL / rpcURL. Only the SDK key differs.
 */

import type { CrooConfig } from './types.js';

/** Default CROO network configuration for Base Mainnet. */
const DEFAULT_CONFIG: CrooConfig = {
  baseURL: 'https://api.croo.network',
  wsURL: 'wss://api.croo.network/ws',
  rpcURL: 'https://mainnet.base.org',
};

/**
 * Create a CROO AgentClient with shared config.
 *
 * Usage:
 * ```ts
 * import { makeClient } from 'croo-core';
 * const client = makeClient(process.env.CROO_SDK_KEY!);
 * ```
 *
 * @param sdkKey - CROO SDK key (`croo_sk_...`) from the Agent Store dashboard
 * @param overrides - Optional config overrides (e.g. custom rpcURL for testing)
 * @returns An initialized AgentClient instance
 */
export function makeClient(sdkKey: string, overrides?: Partial<CrooConfig>) {
  if (!sdkKey || !sdkKey.startsWith('croo_sk_')) {
    throw new Error(
      'Invalid CROO SDK key. Expected format: croo_sk_... (get one from the Agent Store dashboard)'
    );
  }

  const config = { ...DEFAULT_CONFIG, ...overrides };

  // Dynamic import to avoid hard-coupling to the SDK at compile time.
  // The SDK is a peer dependency — each agent controls its own version.
  const { AgentClient } = requireSdk();

  // The SDK's `Config` is a plain object (a type-only export), not a class —
  // build the config literal and hand it straight to the AgentClient ctor.
  const sdkConfig = {
    baseURL: config.baseURL,
    wsURL: config.wsURL,
    ...(config.rpcURL ? { rpcURL: config.rpcURL } : {}),
    ...(config.logger ? { logger: config.logger } : {}),
  };

  return new AgentClient(sdkConfig, sdkKey);
}

/**
 * Resolve the CROO SDK. Throws a clear error if not installed.
 */
import { createRequire } from 'module';

function requireSdk() {
  if (process.env.CROO_MOCK === 'true' || process.env.CROO_ENV === 'mock') {
    return {
      AgentClient: class MockAgentClient {
        constructor(cfg: unknown, key: string) { this.config = cfg; this.key = key; }
        config: unknown; key: string;
        async uploadFile(_buf: Buffer, name: string) { return `https://mock.croo.network/files/${name}`; }
      },
    };
  }

  try {
    const require = createRequire(import.meta.url);
    return require('@croo-network/sdk');
  } catch (_err) {
    console.error('requireSdk error:', _err);
    throw new Error(
      'Missing peer dependency: @croo-network/sdk. Run: npm install @croo-network/sdk'
    );
  }
}

export { DEFAULT_CONFIG };
