import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import { BROADCAST_ACTION } from '@common/runtime-actions';
import {
  STORAGE_KEY_PARSER_BREAKAGE,
  STORAGE_KEY_GITHUB_OUTAGE,
  STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT,
} from '@common/constants';
import type { StorageChange } from '@common/chrome-extension-service';
import { useParserBreakage } from '../use-parser-breakage';
import { useGitHubOutage } from '../use-github-outage';

const chromeMocks = vi.hoisted(() => {
  const self: {
    storageGet: ReturnType<typeof vi.fn>;
    storageListener: null | ((changes: Record<string, StorageChange>, area: string) => void);
    msgListener: null | ((message: { action: string }) => void);
    addListener: ReturnType<typeof vi.fn>;
    removeListener: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    fireMessage: (message: { action: string }) => void;
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
  };
  self.addListener.mockImplementation(
    (cb: (changes: Record<string, StorageChange>, area: string) => void) => {
      self.storageListener = cb;
    }
  );
  self.subscribe.mockImplementation((cb: (message: { action: string }) => void) => {
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
      chromeMocks.fireMessage({ action: BROADCAST_ACTION.githubOutageDetected });
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
      expect(result.current.lastUntrustedAttemptAt).toBe(null);
    });

    act(() => {
      chromeMocks.fireMessage({ action: BROADCAST_ACTION.parserBreakageDetected });
    });

    expect(result.current.isActive).toBe(false);

    act(() => {
      chromeMocks.fireMessage({ action: BROADCAST_ACTION.githubOutageDetected });
    });

    await waitFor(() => {
      expect(result.current.isActive).toBe(true);
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
      expect(result.current.lastUntrustedAttemptAt).toBe(null);
    });
  });

  it('reads last untrusted fetch time from storage when present', async () => {
    chromeMocks.storageGet.mockResolvedValue({
      [STORAGE_KEY_GITHUB_OUTAGE]: { detected: true, timestamp: 1 },
      [STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT]: 12_000,
    });

    const { result } = renderHook(() => useGitHubOutage());

    await waitFor(() => {
      expect(result.current.isActive).toBe(true);
      expect(result.current.lastUntrustedAttemptAt).toBe(12_000);
    });
  });
});
