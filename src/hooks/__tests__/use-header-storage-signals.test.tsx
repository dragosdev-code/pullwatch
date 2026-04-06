import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import {
  STORAGE_KEY_LAST_FETCH,
  STORAGE_KEY_PR_FETCH_IN_PROGRESS,
} from '../../../extension/common/constants';
import { useHeaderStorageSignals } from '../use-header-storage-signals';

describe('useHeaderStorageSignals', () => {
  let capturedListener: Parameters<typeof chrome.storage.onChanged.addListener>[0] | undefined;
  let getCallbackResult: Record<string, unknown> = {};

  beforeEach(() => {
    capturedListener = undefined;
    getCallbackResult = {
      [STORAGE_KEY_LAST_FETCH]: 5_000,
      [STORAGE_KEY_PR_FETCH_IN_PROGRESS]: false,
    };

    const addListener = vi.fn((cb: Parameters<typeof chrome.storage.onChanged.addListener>[0]) => {
      capturedListener = cb;
    });
    const removeListener = vi.fn();
    const get = vi.fn(
      (_keys: string[], cb: (items: Record<string, unknown>) => void) => {
        cb({ ...getCallbackResult });
      },
    );

    (
      globalThis as {
        chrome: typeof chrome;
      }
    ).chrome = {
      runtime: { sendMessage: vi.fn(), lastError: undefined },
      storage: {
        local: { get },
        onChanged: {
          addListener,
          removeListener,
        },
      },
    } as unknown as typeof chrome;
  });

  afterEach(() => {
    cleanup();
    delete (globalThis as { chrome?: typeof chrome }).chrome;
    vi.clearAllMocks();
  });

  it('hydrates from chrome.storage.local.get and listens for changes', async () => {
    const { result, unmount } = renderHook(() => useHeaderStorageSignals());

    await waitFor(() => {
      expect(result.current.lastFetchMs).toBe(5_000);
      expect(result.current.backgroundFetchInProgress).toBe(false);
    });

    expect(capturedListener).toBeDefined();
    capturedListener!(
      {
        [STORAGE_KEY_PR_FETCH_IN_PROGRESS]: { oldValue: false, newValue: true },
      },
      'local',
    );

    await waitFor(() => {
      expect(result.current.backgroundFetchInProgress).toBe(true);
    });

    const removeListener = chrome.storage.onChanged.removeListener as ReturnType<typeof vi.fn>;
    unmount();
    expect(removeListener).toHaveBeenCalled();
  });

  it('treats missing last_fetch as null', async () => {
    getCallbackResult = { [STORAGE_KEY_PR_FETCH_IN_PROGRESS]: false };
    const { result } = renderHook(() => useHeaderStorageSignals());

    await waitFor(() => {
      expect(result.current.lastFetchMs).toBeNull();
    });
  });
});
