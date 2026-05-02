import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
  },
}));

import { GitHubStatusClient, parseSummaryForPRComponent } from '@common/github-status-client';
import {
  GITHUB_STATUS_API_URL,
  GITHUB_STATUS_CACHE_TTL_MS,
  GITHUB_STATUS_FETCH_TIMEOUT_MS,
  STORAGE_KEY_GITHUB_STATUS_CACHE,
} from '@common/constants';
import type { IDebugService } from '../../interfaces/IDebugService';

const T0 = new Date('2026-04-27T12:00:00.000Z').getTime();

function makeDebug(): IDebugService {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as IDebugService;
}

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }): Response {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: async () => body,
  } as Response;
}

function makeSummary(
  prStatus: string | null,
  globalIndicator: string,
  options?: { extraComponentName?: string; pullRequestsName?: string }
): unknown {
  const components: Array<{ name: string; status: string }> = [];
  if (options?.extraComponentName) {
    components.push({ name: options.extraComponentName, status: 'major_outage' });
  }
  if (prStatus !== null) {
    components.push({
      name: options?.pullRequestsName ?? 'Pull Requests',
      status: prStatus,
    });
  }
  return { status: { indicator: globalIndicator }, components };
}

describe('parseSummaryForPRComponent', () => {
  it('reads Pull Requests component status verbatim', () => {
    const out = parseSummaryForPRComponent(makeSummary('major_outage', 'critical'), T0);
    expect(out).toEqual({
      prComponentStatus: 'major_outage',
      globalIndicator: 'critical',
      fetchedAt: T0,
    });
  });

  it('matches component name case-insensitively with whitespace', () => {
    const out = parseSummaryForPRComponent(
      makeSummary('partial_outage', 'minor', { pullRequestsName: '  PULL requests  ' }),
      T0
    );
    expect(out.prComponentStatus).toBe('partial_outage');
  });

  it('returns unknown PR component when component is missing — global still parsed', () => {
    const out = parseSummaryForPRComponent(makeSummary(null, 'minor'), T0);
    expect(out).toEqual({
      prComponentStatus: 'unknown',
      globalIndicator: 'minor',
      fetchedAt: T0,
    });
  });

  it('rejects unknown component status string as unknown', () => {
    const out = parseSummaryForPRComponent(makeSummary('on_fire', 'none'), T0);
    expect(out.prComponentStatus).toBe('unknown');
    expect(out.globalIndicator).toBe('none');
  });

  it('rejects unknown global indicator as unknown', () => {
    const out = parseSummaryForPRComponent(makeSummary('operational', 'apocalyptic'), T0);
    expect(out.prComponentStatus).toBe('operational');
    expect(out.globalIndicator).toBe('unknown');
  });

  it('returns unknown/unknown for non-object payloads', () => {
    expect(parseSummaryForPRComponent(null, T0).prComponentStatus).toBe('unknown');
    expect(parseSummaryForPRComponent('oops', T0).globalIndicator).toBe('unknown');
  });

  it('does not match other components named similarly', () => {
    const json = {
      status: { indicator: 'none' },
      components: [{ name: 'Pull Request Searches', status: 'major_outage' }],
    };
    expect(parseSummaryForPRComponent(json, T0).prComponentStatus).toBe('unknown');
  });
});

describe('GitHubStatusClient.getStatus', () => {
  beforeEach(() => {
    storageGet.mockReset().mockResolvedValue({});
    storageSet.mockReset().mockResolvedValue(undefined);
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('fetches summary.json and writes a cache entry on cold read', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(makeSummary('partial_outage', 'minor')));
    const client = new GitHubStatusClient(makeDebug());

    const out = await client.getStatus();

    expect(fetch).toHaveBeenCalledWith(GITHUB_STATUS_API_URL, expect.any(Object));
    expect(out).toEqual({
      prComponentStatus: 'partial_outage',
      globalIndicator: 'minor',
      fetchedAt: T0,
    });
    expect(storageSet).toHaveBeenCalledWith({
      [STORAGE_KEY_GITHUB_STATUS_CACHE]: out,
    });
  });

  it('returns cache without fetching while within TTL', async () => {
    storageGet.mockResolvedValue({
      [STORAGE_KEY_GITHUB_STATUS_CACHE]: {
        prComponentStatus: 'operational',
        globalIndicator: 'none',
        fetchedAt: T0 - (GITHUB_STATUS_CACHE_TTL_MS - 1),
      },
    });
    const client = new GitHubStatusClient(makeDebug());

    const out = await client.getStatus();

    expect(fetch).not.toHaveBeenCalled();
    expect(out.prComponentStatus).toBe('operational');
  });

  it('refetches after TTL expiry', async () => {
    storageGet.mockResolvedValue({
      [STORAGE_KEY_GITHUB_STATUS_CACHE]: {
        prComponentStatus: 'operational',
        globalIndicator: 'none',
        fetchedAt: T0 - GITHUB_STATUS_CACHE_TTL_MS,
      },
    });
    vi.mocked(fetch).mockResolvedValue(jsonResponse(makeSummary('major_outage', 'critical')));
    const client = new GitHubStatusClient(makeDebug());

    const out = await client.getStatus();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(out.prComponentStatus).toBe('major_outage');
  });

  it('fail-OPEN on non-200: returns unknown without throwing', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, { ok: false, status: 503 }));
    const client = new GitHubStatusClient(makeDebug());

    const out = await client.getStatus();

    expect(out).toEqual({
      prComponentStatus: 'unknown',
      globalIndicator: 'unknown',
      fetchedAt: T0,
    });
  });

  it('fail-OPEN on AbortController timeout — deterministic via fake timers', async () => {
    vi.mocked(fetch).mockImplementation((_url, options) => {
      return new Promise((_resolve, reject) => {
        const signal = (options as { signal?: AbortSignal }).signal;
        signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });
    const client = new GitHubStatusClient(makeDebug());

    const promise = client.getStatus();
    await vi.advanceTimersByTimeAsync(GITHUB_STATUS_FETCH_TIMEOUT_MS + 1);
    const out = await promise;

    expect(out.prComponentStatus).toBe('unknown');
    expect(out.globalIndicator).toBe('unknown');
  });

  it('fail-OPEN on thrown fetch error', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('DNS exploded'));
    const client = new GitHubStatusClient(makeDebug());

    const out = await client.getStatus();

    expect(out.prComponentStatus).toBe('unknown');
  });

  it('logs drift warning when component missing but global indicator present', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(makeSummary(null, 'major')));
    const debug = makeDebug();
    const client = new GitHubStatusClient(debug);

    const out = await client.getStatus();

    expect(out).toEqual({
      prComponentStatus: 'unknown',
      globalIndicator: 'major',
      fetchedAt: T0,
    });
    expect(debug.warn).toHaveBeenCalledWith(
      expect.stringContaining('Pull Requests component not found')
    );
  });

  it('bypassCache: true skips TTL short-circuit even with a fresh cache entry', async () => {
    storageGet.mockResolvedValue({
      [STORAGE_KEY_GITHUB_STATUS_CACHE]: {
        prComponentStatus: 'operational',
        globalIndicator: 'none',
        fetchedAt: T0 - 1, // 1ms old — well within TTL
      },
    });
    vi.mocked(fetch).mockResolvedValue(jsonResponse(makeSummary('major_outage', 'critical')));
    const client = new GitHubStatusClient(makeDebug());

    const out = await client.getStatus({ bypassCache: true });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(out.prComponentStatus).toBe('major_outage');
  });

  it('bypassCache: true overwrites the stored cache so subsequent non-bypass reads see the fresh snapshot', async () => {
    let stored: unknown = {
      prComponentStatus: 'operational',
      globalIndicator: 'none',
      fetchedAt: T0 - 1,
    };
    storageGet.mockImplementation(async () => ({ [STORAGE_KEY_GITHUB_STATUS_CACHE]: stored }));
    storageSet.mockImplementation(async (entry: Record<string, unknown>) => {
      stored = entry[STORAGE_KEY_GITHUB_STATUS_CACHE];
    });
    vi.mocked(fetch).mockResolvedValue(jsonResponse(makeSummary('partial_outage', 'major')));
    const client = new GitHubStatusClient(makeDebug());

    await client.getStatus({ bypassCache: true });
    const second = await client.getStatus(); // non-bypass should see the just-written entry

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(second.prComponentStatus).toBe('partial_outage');
  });
});
