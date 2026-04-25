import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { PatternRegistryService } from '../PatternRegistryService';
import { STORAGE_KEY_PATTERN_REGISTRY } from '@common/constants';
import { DEFAULT_COMPILED_PATTERNS, DEFAULT_PATTERNS } from '@common/default-patterns';
import { clone, makeValidRemoteConfig } from '@common/__tests__/schema-test-helpers';
import type { IDebugService } from '../../interfaces/IDebugService';

const storageGet = vi.fn();
const storageSet = vi.fn().mockResolvedValue(undefined);

vi.mock('@common/chrome-extension-service', () => ({
  chromeExtensionService: {
    storage: {
      local: {
        get: (...args: unknown[]) => storageGet(...args),
        set: (...args: unknown[]) => storageSet(...args),
      },
    },
    runtime: {
      getManifest: () => ({ version: '1.0.0' }),
    },
  },
}));

function createDebugService(): IDebugService {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as IDebugService;
}

function okJsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
  } as Response;
}

describe('Remote pattern delivery', () => {
  beforeEach(() => {
    storageGet.mockReset();
    storageSet.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('applies updated patterns after a successful fetch and schema validation', async () => {
    storageGet.mockResolvedValue({});

    const remotePatterns = clone(DEFAULT_PATTERNS);
    remotePatterns.pageRecognition.hasPRContent = {
      regex: 'REMOTE_REGISTRY_UNIQUE',
      flags: '',
    };

    const remoteBody = makeValidRemoteConfig({
      version: 42,
      minExtensionVersion: '0.0.0',
      patterns: remotePatterns,
    });

    vi.mocked(fetch).mockResolvedValue(okJsonResponse(remoteBody));

    const service = new PatternRegistryService(createDebugService());

    await service.initialize();

    await waitFor(() => {
      const wroteRemote = storageSet.mock.calls.some((call) => {
        const payload = call[0] as Record<string, { version?: number }>;
        return payload[STORAGE_KEY_PATTERN_REGISTRY]?.version === 42;
      });
      expect(wroteRemote).toBe(true);
    });

    expect(
      service.getPatterns().pageRecognition.hasPRContent.compiled.source,
    ).toBe('REMOTE_REGISTRY_UNIQUE');
  });

  it('falls back to bundled patterns when the registry fetch fails or returns an invalid schema', async () => {
    storageGet.mockResolvedValue({});

    vi.mocked(fetch).mockRejectedValueOnce(new Error('network down'));

    const debugA = createDebugService();
    const serviceA = new PatternRegistryService(debugA);

    await expect(serviceA.initialize()).resolves.toBeUndefined();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    expect(serviceA.getPatterns()).toBe(DEFAULT_COMPILED_PATTERNS);
    expect(storageSet).toHaveBeenCalledTimes(1);
    const firstPayload = storageSet.mock.calls[0][0] as Record<
      string,
      { version: number }
    >;
    expect(firstPayload[STORAGE_KEY_PATTERN_REGISTRY].version).toBe(0);
    expect(debugA.warn).toHaveBeenCalled();

    vi.mocked(fetch).mockReset();
    storageGet.mockResolvedValue({});
    storageSet.mockClear();

    vi.mocked(fetch).mockResolvedValue(
      okJsonResponse({
        version: 1,
        minExtensionVersion: '1.0.0',
        patterns: { not: 'a full registry' },
      }),
    );

    const debugB = createDebugService();
    const warnB = vi.mocked(debugB.warn);
    const serviceB = new PatternRegistryService(debugB);

    await expect(serviceB.initialize()).resolves.toBeUndefined();

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    expect(serviceB.getPatterns()).toBe(DEFAULT_COMPILED_PATTERNS);
    expect(storageSet).toHaveBeenCalledTimes(1);
    expect(warnB).toHaveBeenCalled();
    expect(
      warnB.mock.calls.some(
        (args: unknown[]) =>
          typeof args[0] === 'string' && args[0].includes('Remote config rejected'),
      ),
    ).toBe(true);
  });
});
