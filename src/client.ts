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
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AgentClient, Config } = requireSdk();

  const sdkConfig = new Config();
  sdkConfig.baseURL = config.baseURL;
  sdkConfig.wsURL = config.wsURL;
  if (config.rpcURL) sdkConfig.rpcURL = config.rpcURL;
  if (config.logger) sdkConfig.logger = config.logger;

  return new AgentClient(sdkConfig, sdkKey);
}

/**
 * Resolve the CROO SDK. Throws a clear error if not installed.
 */
function requireSdk() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('@croo-network/sdk');
  } catch (_err) {
    throw new Error(
      'Missing peer dependency: @croo-network/sdk. Run: npm install @croo-network/sdk'
    );
  }
}

export { DEFAULT_CONFIG };
