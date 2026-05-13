import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HealthStatusService } from '../HealthStatusService';
import { STORAGE_KEY_GITHUB_OUTAGE } from '@common/constants';
import { BROADCAST_ACTION } from '@common/runtime-actions';
import type { GitHubOutagePayload } from '@common/types';

const chromeMocks = vi.hoisted(() => {
  const storageState: Record<string, unknown> = {};
  return {
    storageState,
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(storageState, items);
    }),
    get: vi.fn(async (key?: string | string[]) => {
      if (typeof key === 'string') return { [key]: storageState[key] };
      if (Array.isArray(key)) {
        return Object.fromEntries(key.map((k) => [k, storageState[k]]));
      }
      return { ...storageState };
    }),
    remove: vi.fn(async (key: string | string[]) => {
      for (const k of Array.isArray(key) ? key : [key]) {
        delete storageState[k];
      }
    }),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@common/chrome-extension-service', () => ({
  chromeExtensionService: {
    storage: {
      local: {
        get: (...args: unknown[]) =>
          (chromeMocks.get as (...a: unknown[]) => Promise<Record<string, unknown>>)(...args),
        set: (...args: unknown[]) =>
          (chromeMocks.set as (...a: unknown[]) => Promise<void>)(...args),
        remove: (...args: unknown[]) =>
          (chromeMocks.remove as (...a: unknown[]) => Promise<void>)(...args),
      },
    },
    runtime: {
      sendMessage: (...args: unknown[]) =>
        (chromeMocks.sendMessage as (...a: unknown[]) => Promise<void>)(...args),
    },
  },
}));

const T0 = 1_700_000_000_000;

describe('HealthStatusService GitHub outage payloads', () => {
  beforeEach(() => {
    for (const key of Object.keys(chromeMocks.storageState)) {
      delete chromeMocks.storageState[key];
    }
    chromeMocks.get.mockClear();
    chromeMocks.set.mockClear();
    chromeMocks.remove.mockClear();
    chromeMocks.sendMessage.mockClear();
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes lastSeenAt on repeated outage signals without rebroadcasting or replacing first context', async () => {
    const service = new HealthStatusService();
    await service.initialize();

    await service.signalGitHubOutage('assigned PR fetch', 'transport');

    expect(chromeMocks.sendMessage).toHaveBeenCalledWith({
      action: BROADCAST_ACTION.githubOutageDetected,
      data: {
        detected: true,
        timestamp: T0,
        lastSeenAt: T0,
        context: 'assigned PR fetch',
        reason: 'transport',
      },
    });

    vi.setSystemTime(T0 + 60_000);
    await service.signalGitHubOutage('merged PR fetch', 'pr_component_degraded');

    const stored = chromeMocks.storageState[STORAGE_KEY_GITHUB_OUTAGE] as GitHubOutagePayload;
    expect(stored).toEqual({
      detected: true,
      timestamp: T0,
      lastSeenAt: T0 + 60_000,
      context: 'assigned PR fetch',
      reason: 'transport',
    });
    expect(chromeMocks.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('upgrades a deduped transport payload to site_access_blocked in-place and rebroadcasts', async () => {
    const service = new HealthStatusService();
    await service.initialize();

    await service.signalGitHubOutage('assigned PR fetch', 'transport');
    chromeMocks.sendMessage.mockClear();

    vi.setSystemTime(T0 + 30_000);
    await service.signalGitHubOutage(
      'chrome://extensions site access revoked',
      'site_access_blocked'
    );

    const stored = chromeMocks.storageState[STORAGE_KEY_GITHUB_OUTAGE] as GitHubOutagePayload;
    expect(stored).toEqual({
      detected: true,
      // Original timestamp preserved so the banner does not claim a fresh outage cycle.
      timestamp: T0,
      lastSeenAt: T0 + 30_000,
      context: 'chrome://extensions site access revoked',
      reason: 'site_access_blocked',
    });
    expect(chromeMocks.sendMessage).toHaveBeenCalledWith({
      action: BROADCAST_ACTION.githubOutageDetected,
      data: stored,
    });
  });

  it('does not downgrade an active site_access_blocked payload back to transport', async () => {
    const service = new HealthStatusService();
    await service.initialize();

    await service.signalGitHubOutage(
      'chrome://extensions site access revoked',
      'site_access_blocked'
    );
    chromeMocks.sendMessage.mockClear();

    vi.setSystemTime(T0 + 30_000);
    await service.signalGitHubOutage('assigned PR fetch', 'transport');

    const stored = chromeMocks.storageState[STORAGE_KEY_GITHUB_OUTAGE] as GitHubOutagePayload;
    expect(stored.reason).toBe('site_access_blocked');
    expect(stored.context).toBe('chrome://extensions site access revoked');
    expect(chromeMocks.sendMessage).not.toHaveBeenCalled();
  });

  it('persists and broadcasts a site_access_blocked outage payload with the right discriminator', async () => {
    const service = new HealthStatusService();
    await service.initialize();

    await service.signalGitHubOutage(
      'chrome://extensions site access revoked',
      'site_access_blocked'
    );

    const stored = chromeMocks.storageState[STORAGE_KEY_GITHUB_OUTAGE] as GitHubOutagePayload;
    expect(stored).toEqual({
      detected: true,
      timestamp: T0,
      lastSeenAt: T0,
      context: 'chrome://extensions site access revoked',
      reason: 'site_access_blocked',
    });
    expect(chromeMocks.sendMessage).toHaveBeenCalledWith({
      action: BROADCAST_ACTION.githubOutageDetected,
      data: {
        detected: true,
        timestamp: T0,
        lastSeenAt: T0,
        context: 'chrome://extensions site access revoked',
        reason: 'site_access_blocked',
      },
    });
  });
});
