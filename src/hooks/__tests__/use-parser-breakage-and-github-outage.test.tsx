import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import { BROADCAST_ACTION } from '@common/runtime-actions';
import {
  GITHUB_OUTAGE_STALE_AFTER_MS,
  STORAGE_KEY_PARSER_BREAKAGE,
  STORAGE_KEY_GITHUB_OUTAGE,
  STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT,
} from '@common/constants';
import type { StorageChange } from '@common/chrome-extension-service';
import type { GitHubOutagePayload } from '@common/types';
import { useParserBreakage } from '../use-parser-breakage';
import { useGitHubOutage } from '../use-github-outage';

const chromeMocks = vi.hoisted(() => {
  const self: {
    storageGet: ReturnType<typeof vi.fn>;
    storageListener: null | ((changes: Record<string, StorageChange>, area: string) => void);
    msgListener: null | ((message: { action: string; data?: unknown }) => void);
    addListener: ReturnType<typeof vi.fn>;
    removeListener: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    fireMessage: (message: { action: string; data?: unknown }) => void;
    fireStorageChange: (changes: Record<string, StorageChange>) => void;
  } = {
    storageGet: vi.fn(),
    storageListener: null,
    msgListener: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    subscribe: vi.fn(),
    fireMessage(message) {
      self.msgListener?.(message);
    },
    fireStorageChange(changes) {
      self.storageListener?.(changes, 'local');
    },
  };
  self.addListener.mockImplementation(
    (cb: (changes: Record<string, StorageChange>, area: string) => void) => {
      self.storageListener = cb;
    }
  );
  self.subscribe.mockImplementation((cb: (message: { action: string; data?: unknown }) => void) => {
    self.msgListener = cb;
    return () => {
      self.msgListener = null;
    };
  });
  return self;
});

vi.mock('@common/chrome-extension-service', () => ({
  chromeExtensionService: {
    isExtensionContext: () => true,
    storage: {
      local: {
        get: (...args: unknown[]) =>
          (chromeMocks.storageGet as (...a: unknown[]) => unknown)(...args),
      },
      onChanged: {
        addListener: (cb: unknown) => (chromeMocks.addListener as (c: unknown) => void)(cb),
        removeListener: (...args: unknown[]) =>
          (chromeMocks.removeListener as (...a: unknown[]) => void)(...args),
      },
    },
    messages: {
      subscribe: (cb: unknown) => (chromeMocks.subscribe as (c: unknown) => () => void)(cb),
    },
  },
}));

const transportPayload: GitHubOutagePayload = {
  detected: true,
  timestamp: 1_700_000_000_000,
  lastSeenAt: Date.now(),
  context: 'transport boom',
  reason: 'transport',
};
const componentDegradedPayload: GitHubOutagePayload = {
  detected: true,
  timestamp: 1_700_000_001_000,
  lastSeenAt: Date.now(),
  context: 'PR component down',
  reason: 'pr_component_degraded',
};
const listChurnPayload: GitHubOutagePayload = {
  detected: true,
  timestamp: 1_700_000_002_000,
  lastSeenAt: Date.now(),
  context: 'tombstone resurrection',
  reason: 'pr_list_churn',
};
const siteAccessBlockedPayload: GitHubOutagePayload = {
  detected: true,
  timestamp: 1_700_000_003_000,
  lastSeenAt: Date.now(),
  context: 'chrome://extensions site access revoked',
  reason: 'site_access_blocked',
};

describe('Status banners after a bad sync', () => {
  beforeEach(() => {
    chromeMocks.storageGet.mockReset();
    chromeMocks.storageListener = null;
    chromeMocks.msgListener = null;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the parser breakage banner when the background reports a parse failure', async () => {
    chromeMocks.storageGet.mockResolvedValue({
      [STORAGE_KEY_PARSER_BREAKAGE]: false,
    });

    const { result } = renderHook(() => useParserBreakage());

    await waitFor(() => {
      expect(result.current).toBe(false);
    });

    act(() => {
      chromeMocks.fireMessage({ action: BROADCAST_ACTION.parserBreakageDetected });
    });

    await waitFor(() => {
      expect(result.current).toBe(true);
    });

    act(() => {
      chromeMocks.fireMessage({
        action: BROADCAST_ACTION.githubOutageDetected,
        data: transportPayload,
      });
    });

    expect(result.current).toBe(true);

    act(() => {
      chromeMocks.fireMessage({ action: BROADCAST_ACTION.parserBreakageCleared });
    });

    await waitFor(() => {
      expect(result.current).toBe(false);
    });
  });

  it('shows the outage banner when GitHub appears temporarily unavailable', async () => {
    chromeMocks.storageGet.mockResolvedValue({
      [STORAGE_KEY_GITHUB_OUTAGE]: false,
    });

    const { result } = renderHook(() => useGitHubOutage());

    await waitFor(() => {
      expect(result.current.isActive).toBe(false);
      expect(result.current.payload).toBe(null);
      expect(result.current.lastUntrustedAttemptAt).toBe(null);
    });

    act(() => {
      chromeMocks.fireMessage({ action: BROADCAST_ACTION.parserBreakageDetected });
    });

    expect(result.current.isActive).toBe(false);

    act(() => {
      chromeMocks.fireMessage({
        action: BROADCAST_ACTION.githubOutageDetected,
        data: transportPayload,
      });
    });

    await waitFor(() => {
      expect(result.current.isActive).toBe(true);
      expect(result.current.payload?.reason).toBe('transport');
      expect(result.current.payload?.context).toBe('transport boom');
    });

    act(() => {
      chromeMocks.fireMessage({ action: BROADCAST_ACTION.parserBreakageDetected });
    });

    expect(result.current.isActive).toBe(true);

    act(() => {
      chromeMocks.fireMessage({ action: BROADCAST_ACTION.githubOutageCleared });
    });

    await waitFor(() => {
      expect(result.current.isActive).toBe(false);
      expect(result.current.payload).toBe(null);
      expect(result.current.lastUntrustedAttemptAt).toBe(null);
    });
  });

  it('reads last untrusted fetch time from storage when the persisted reason is pr_component_degraded', async () => {
    chromeMocks.storageGet.mockResolvedValue({
      [STORAGE_KEY_GITHUB_OUTAGE]: componentDegradedPayload,
      [STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT]: 12_000,
    });

    const { result } = renderHook(() => useGitHubOutage());

    await waitFor(() => {
      expect(result.current.isActive).toBe(true);
      expect(result.current.payload?.reason).toBe('pr_component_degraded');
      expect(result.current.lastUntrustedAttemptAt).toBe(12_000);
    });
  });

  it('round-trips each reason through the broadcast handler', async () => {
    chromeMocks.storageGet.mockResolvedValue({});
    const { result } = renderHook(() => useGitHubOutage());

    await waitFor(() => {
      expect(result.current.isActive).toBe(false);
    });

    act(() => {
      chromeMocks.fireMessage({
        action: BROADCAST_ACTION.githubOutageDetected,
        data: componentDegradedPayload,
      });
    });
    await waitFor(() => {
      expect(result.current.payload?.reason).toBe('pr_component_degraded');
    });

    act(() => {
      chromeMocks.fireMessage({
        action: BROADCAST_ACTION.githubOutageDetected,
        data: listChurnPayload,
      });
    });
    await waitFor(() => {
      expect(result.current.payload?.reason).toBe('pr_list_churn');
    });

    act(() => {
      chromeMocks.fireMessage({
        action: BROADCAST_ACTION.githubOutageDetected,
        data: siteAccessBlockedPayload,
      });
    });
    await waitFor(() => {
      expect(result.current.payload?.reason).toBe('site_access_blocked');
      expect(result.current.payload?.context).toBe('chrome://extensions site access revoked');
    });
  });

  it('falls back to a fresh storage read when the broadcast omits a payload', async () => {
    chromeMocks.storageGet
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ [STORAGE_KEY_GITHUB_OUTAGE]: transportPayload });

    const { result } = renderHook(() => useGitHubOutage());

    await waitFor(() => {
      expect(result.current.isActive).toBe(false);
    });

    act(() => {
      chromeMocks.fireMessage({ action: BROADCAST_ACTION.githubOutageDetected });
    });

    await waitFor(() => {
      expect(result.current.isActive).toBe(true);
      expect(result.current.payload?.reason).toBe('transport');
    });
  });

  it('falls back to reason="transport" for legacy payloads missing the discriminator', async () => {
    const legacyPayload = {
      detected: true,
      timestamp: Date.now(),
      context: 'pre-reason build',
    };
    chromeMocks.storageGet.mockResolvedValue({
      [STORAGE_KEY_GITHUB_OUTAGE]: legacyPayload,
    });

    const { result } = renderHook(() => useGitHubOutage());

    await waitFor(() => {
      expect(result.current.isActive).toBe(true);
      expect(result.current.payload?.reason).toBe('transport');
      expect(result.current.payload?.context).toBe('pre-reason build');
    });
  });

  it('ignores a stale stored outage and drops stale untrusted metadata', async () => {
    chromeMocks.storageGet.mockResolvedValue({
      [STORAGE_KEY_GITHUB_OUTAGE]: {
        ...componentDegradedPayload,
        lastSeenAt: Date.now() - GITHUB_OUTAGE_STALE_AFTER_MS - 1,
      },
      [STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT]: 12_000,
    });

    const { result } = renderHook(() => useGitHubOutage());

    await waitFor(() => {
      expect(result.current.isActive).toBe(false);
      expect(result.current.payload).toBe(null);
      expect(result.current.lastUntrustedAttemptAt).toBe(null);
    });
  });

  it('storage onChanged with newValue undefined clears the banner', async () => {
    chromeMocks.storageGet.mockResolvedValue({
      [STORAGE_KEY_GITHUB_OUTAGE]: transportPayload,
    });

    const { result } = renderHook(() => useGitHubOutage());
    await waitFor(() => {
      expect(result.current.isActive).toBe(true);
    });

    act(() => {
      chromeMocks.fireStorageChange({
        [STORAGE_KEY_GITHUB_OUTAGE]: { newValue: undefined, oldValue: transportPayload },
      });
    });

    await waitFor(() => {
      expect(result.current.isActive).toBe(false);
      expect(result.current.payload).toBe(null);
    });
  });
});
