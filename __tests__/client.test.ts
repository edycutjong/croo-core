/**
 * croo-core/client — Tests for the CROO client factory.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// We can't import the real SDK in tests, so we test the validation logic
// by importing the module and mocking require.
describe('makeClient', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('throws on empty SDK key', async () => {
    const { makeClient } = await import('../src/client.js');
    expect(() => makeClient('')).toThrow('Invalid CROO SDK key');
  });

  it('throws on malformed SDK key (missing prefix)', async () => {
    const { makeClient } = await import('../src/client.js');
    expect(() => makeClient('sk_wrong_prefix')).toThrow('Invalid CROO SDK key');
  });

  it('throws on undefined SDK key', async () => {
    const { makeClient } = await import('../src/client.js');
    // @ts-expect-error — intentionally passing undefined for testing
    expect(() => makeClient(undefined)).toThrow('Invalid CROO SDK key');
  });

  it('exports DEFAULT_CONFIG with correct values', async () => {
    const { DEFAULT_CONFIG } = await import('../src/client.js');
    expect(DEFAULT_CONFIG.baseURL).toBe('https://api.croo.network');
    expect(DEFAULT_CONFIG.wsURL).toBe('wss://api.croo.network/ws');
    expect(DEFAULT_CONFIG.rpcURL).toBe('https://mainnet.base.org');
  });
});
