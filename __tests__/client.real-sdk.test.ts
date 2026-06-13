/**
 * croo-core/client — REAL @croo-network/sdk integration test.
 *
 * client.test.ts only checks key validation; mock-mode tests check the fake
 * client. THIS file constructs a client against the REAL published SDK to
 * prove makeClient() wires the AgentClient correctly.
 *
 * It is the regression guard for the `new Config()` bug: the SDK exports
 * `Config` as a TYPE ONLY, so calling `new Config()` throws
 * "Config is not a constructor". Constructing the real AgentClient here is
 * side-effect-free — no WebSocket, no network call, no USDC spent.
 *
 * Skipped automatically if the SDK (a peerDependency) isn't installed.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';

function sdkAvailable(): boolean {
  try {
    createRequire(import.meta.url).resolve('@croo-network/sdk');
    return true;
  } catch {
    return false;
  }
}

describe.runIf(sdkAvailable())('makeClient — real @croo-network/sdk', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.CROO_MOCK;
    delete process.env.CROO_ENV;
  });

  it('constructs the REAL AgentClient, not the in-memory mock', async () => {
    const { makeClient } = await import('../src/client.js');
    const client = makeClient('croo_sk_test_probe');
    expect(client.constructor.name).toBe('AgentClient');
  });

  it('exposes every SDK method croo-core depends on', async () => {
    const { makeClient } = await import('../src/client.js');
    const client = makeClient('croo_sk_test_probe') as Record<string, unknown>;
    for (const method of [
      'negotiateOrder',
      'acceptNegotiation',
      'payOrder',
      'deliverOrder',
      'rejectOrder',
      'getOrder',
      'getDelivery',
      'listOrders',
      'connectWebSocket',
    ]) {
      expect(typeof client[method]).toBe('function');
    }
  });

  it('does not throw while building the SDK config (guards the `new Config()` regression)', async () => {
    const { makeClient } = await import('../src/client.js');
    expect(() =>
      makeClient('croo_sk_test_probe', {
        rpcURL: 'https://custom.example.rpc',
        logger: console,
      }),
    ).not.toThrow();
  });
});
