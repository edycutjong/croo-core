/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * croo-core/client — Tests for the CROO client factory.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
    expect(() => makeClient(undefined as any)).toThrow('Invalid CROO SDK key');
  });

  it('exports DEFAULT_CONFIG with correct values', async () => {
    const { DEFAULT_CONFIG } = await import('../src/client.js');
    expect(DEFAULT_CONFIG.baseURL).toBe('https://api.croo.network');
    expect(DEFAULT_CONFIG.wsURL).toBe('wss://api.croo.network/ws');
    expect(DEFAULT_CONFIG.rpcURL).toBe('https://mainnet.base.org');
  });
});

// Construction path exercised through the in-memory mock client so it needs
// no network or real SDK. Covers the requireSdk() mock branch + override merge.
describe('makeClient — mock mode (CROO_MOCK=true)', () => {
  const original = process.env.CROO_MOCK;

  beforeEach(() => {
    vi.resetModules();
    process.env.CROO_MOCK = 'true';
  });

  afterEach(() => {
    if (original === undefined) delete process.env.CROO_MOCK;
    else process.env.CROO_MOCK = original;
  });

  it('returns the in-memory MockAgentClient', async () => {
    const { makeClient } = await import('../src/client.js');
    const client = makeClient('croo_sk_mock');
    expect(client.constructor.name).toBe('CrooAgentClient');
  });

  it('mock uploadFile returns a deterministic mock URL (SDK signature: fileName, body)', async () => {
    const { makeClient } = await import('../src/client.js');
    const client = makeClient('croo_sk_mock') as unknown as {
      uploadFile: (fileName: string, body: Buffer) => Promise<string>;
    };
    await expect(client.uploadFile('report.pdf', Buffer.from('x'))).resolves.toBe(
      'https://mock.croo.network/files/report.pdf',
    );
  });

  it('merges config overrides into the SDK config', async () => {
    const { makeClient } = await import('../src/client.js');
    const client = makeClient('croo_sk_mock', { rpcURL: 'https://custom.rpc' }) as unknown as {
      config: { baseURL: string; rpcURL?: string };
    };
    expect(client.config.baseURL).toBe('https://api.croo.network');
    expect(client.config.rpcURL).toBe('https://custom.rpc');
  });

  it('omits rpcURL from the SDK config when it is overridden to undefined', async () => {
    const { makeClient } = await import('../src/client.js');
    const client = makeClient('croo_sk_mock', { rpcURL: undefined }) as unknown as {
      config: { rpcURL?: string };
    };
    expect(client.config.rpcURL).toBeUndefined();
  });
});

// Force the real branch and make the SDK require() fail, to cover the
// "Missing peer dependency" error path.
describe('makeClient — SDK not installed', () => {
  const original = process.env.CROO_MOCK;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.CROO_MOCK;
    delete process.env.CROO_ENV;
  });

  afterEach(() => {
    vi.doUnmock('module');
    vi.resetModules();
    if (original === undefined) delete process.env.CROO_MOCK;
    else process.env.CROO_MOCK = original;
  });

  it('throws a clear error when @croo-network/sdk cannot be resolved', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.doMock('module', async (importOriginal) => {
      const actual = await importOriginal<typeof import('module')>();
      return {
        ...actual,
        createRequire: () => () => {
          throw new Error("Cannot find module '@croo-network/sdk'");
        },
      };
    });

    const { makeClient } = await import('../src/client.js');
    expect(() => makeClient('croo_sk_real')).toThrow(
      'Missing peer dependency: @croo-network/sdk',
    );
  });
});

// The shared-WebSocket multiplexing lives on the CrooAgentClient subclass.
// Exercised in mock mode (no real SDK needed) by stubbing connectWebSocket on
// the instance with a fake stream.
describe('makeClient — shared WebSocket stream (getSharedStream / disconnect)', () => {
  const original = process.env.CROO_MOCK;

  beforeEach(() => {
    vi.resetModules();
    process.env.CROO_MOCK = 'true';
  });

  afterEach(() => {
    if (original === undefined) delete process.env.CROO_MOCK;
    else process.env.CROO_MOCK = original;
  });

  async function freshClient() {
    const { makeClient } = await import('../src/client.js');
     
    return makeClient('croo_sk_mock') as any;
  }

  it('connects once and caches the shared stream', async () => {
    const client = await freshClient();
    const fakeStream = { on: vi.fn(), close: vi.fn() };
    client.connectWebSocket = vi.fn().mockResolvedValue(fakeStream);

    const s1 = await client.getSharedStream();
    const s2 = await client.getSharedStream();

    expect(s1).toBe(fakeStream);
    expect(s2).toBe(fakeStream);
    expect(client.connectWebSocket).toHaveBeenCalledTimes(1);
    expect(fakeStream.on).toHaveBeenCalledWith('close', expect.any(Function));
    expect(fakeStream.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('dedupes concurrent callers into a single connection', async () => {
    const client = await freshClient();
    const fakeStream = { on: vi.fn(), close: vi.fn() };
    let resolveConnect: (s: unknown) => void = () => {};
    client.connectWebSocket = vi.fn(() => new Promise((r) => { resolveConnect = r; }));

    const p1 = client.getSharedStream();
    const p2 = client.getSharedStream();
    resolveConnect(fakeStream);
    const [s1, s2] = await Promise.all([p1, p2]);

    expect(s1).toBe(fakeStream);
    expect(s2).toBe(fakeStream);
    expect(client.connectWebSocket).toHaveBeenCalledTimes(1);
  });

  it('reconnects after the shared stream emits close', async () => {
    const client = await freshClient();
    const fakeStream = { on: vi.fn(), close: vi.fn() };
    client.connectWebSocket = vi.fn().mockResolvedValue(fakeStream);

    await client.getSharedStream();
    const closeHandler = fakeStream.on.mock.calls.find(
      (c: unknown[]) => c[0] === 'close',
    )![1] as () => void;
    closeHandler(); // reset internal state

    await client.getSharedStream();
    expect(client.connectWebSocket).toHaveBeenCalledTimes(2);
  });

  it('handles a stream without an on() method', async () => {
    const client = await freshClient();
    const fakeStream = { close: vi.fn() }; // no .on
    client.connectWebSocket = vi.fn().mockResolvedValue(fakeStream);
    await expect(client.getSharedStream()).resolves.toBe(fakeStream);
  });

  it('resets the pending promise so a failed connection can be retried', async () => {
    const client = await freshClient();
    const fakeStream = { on: vi.fn(), close: vi.fn() };
    client.connectWebSocket = vi
      .fn()
      .mockRejectedValueOnce(new Error('ws down'))
      .mockResolvedValueOnce(fakeStream);

    await expect(client.getSharedStream()).rejects.toThrow('ws down');
    await expect(client.getSharedStream()).resolves.toBe(fakeStream);
    expect(client.connectWebSocket).toHaveBeenCalledTimes(2);
  });

  it('disconnect() closes the active stream and clears state', async () => {
    const client = await freshClient();
    const fakeStream = { on: vi.fn(), close: vi.fn() };
    client.connectWebSocket = vi.fn().mockResolvedValue(fakeStream);

    await client.getSharedStream();
    client.disconnect();

    expect(fakeStream.close).toHaveBeenCalled();
    await client.getSharedStream(); // reconnects after disconnect
    expect(client.connectWebSocket).toHaveBeenCalledTimes(2);
  });

  it('disconnect() is a no-op when no stream is active', async () => {
    const client = await freshClient();
    expect(() => client.disconnect()).not.toThrow();
  });

  it('disconnect() tolerates a stream without a close() method', async () => {
    const client = await freshClient();
    const fakeStream = { on: vi.fn() }; // no close
    client.connectWebSocket = vi.fn().mockResolvedValue(fakeStream);
    await client.getSharedStream();
    expect(() => client.disconnect()).not.toThrow();
  });
});

describe('MockAgentClient methods', () => {
  it('implements acceptNegotiationWithFundAddress, rejectNegotiation, and listOrders', async () => {
    const { makeClient } = await import('../src/client.js');
    const originalEnv = process.env.CROO_MOCK;
    process.env.CROO_MOCK = 'true';
    try {
      const client = makeClient('croo_sk_mock') as any;
      await expect(client.acceptNegotiationWithFundAddress('neg_1', '0x123')).resolves.toEqual({
        negotiationId: 'neg_1',
        payoutAddress: '0x123',
      });
      await expect(client.rejectNegotiation('neg_2', 'reason')).resolves.toEqual({
        negotiationId: 'neg_2',
        reason: 'reason',
      });
      await expect(client.listOrders()).resolves.toEqual([]);
    } finally {
      if (originalEnv === undefined) delete process.env.CROO_MOCK;
      else process.env.CROO_MOCK = originalEnv;
    }
  });
});

