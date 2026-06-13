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

  it('mock uploadFile returns a deterministic mock URL', async () => {
    const { makeClient } = await import('../src/client.js');
    const client = makeClient('croo_sk_mock') as {
      uploadFile: (b: Buffer, name: string) => Promise<string>;
    };
    await expect(client.uploadFile(Buffer.from('x'), 'report.pdf')).resolves.toBe(
      'https://mock.croo.network/files/report.pdf',
    );
  });

  it('merges config overrides into the SDK config', async () => {
    const { makeClient } = await import('../src/client.js');
    const client = makeClient('croo_sk_mock', { rpcURL: 'https://custom.rpc' }) as {
      config: { baseURL: string; rpcURL?: string };
    };
    expect(client.config.baseURL).toBe('https://api.croo.network');
    expect(client.config.rpcURL).toBe('https://custom.rpc');
  });

  it('omits rpcURL from the SDK config when it is overridden to undefined', async () => {
    const { makeClient } = await import('../src/client.js');
    const client = makeClient('croo_sk_mock', { rpcURL: undefined }) as {
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
