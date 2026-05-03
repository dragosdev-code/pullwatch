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
});
