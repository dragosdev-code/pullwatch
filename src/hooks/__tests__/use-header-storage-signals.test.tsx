import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import {
  STORAGE_KEY_LAST_FETCH,
  STORAGE_KEY_PR_FETCH_IN_PROGRESS,
} from '@common/constants';
import { useHeaderStorageSignals } from '../use-header-storage-signals';
import type { StorageChange } from '@common/chrome-extension-service';

const getMock = vi.fn();
const addListenerMock = vi.fn();
const removeListenerMock = vi.fn();

vi.mock('@common/chrome-extension-service', () => ({
  chromeExtensionService: {
    isExtensionContext: vi.fn(() => true),
    storage: {
      local: {
        get: (...args: unknown[]) => getMock(...args),
      },
      onChanged: {
        addListener: (cb: unknown) => addListenerMock(cb),
        removeListener: (cb: unknown) => removeListenerMock(cb),
      },
    },
  },
}));

vi.mock('@src/utils/is-extension-context', () => ({
  isExtensionContext: () => true,
}));

describe('useHeaderStorageSignals', () => {
  let capturedListener:
    | ((changes: Record<string, StorageChange>, area: string) => void)
    | undefined;
  let getResult: Record<string, unknown> = {};

  beforeEach(() => {
    capturedListener = undefined;
    getResult = {
      [STORAGE_KEY_LAST_FETCH]: 5_000,
      [STORAGE_KEY_PR_FETCH_IN_PROGRESS]: false,
    };

    getMock.mockReset().mockImplementation(async () => ({ ...getResult }));
    addListenerMock.mockReset().mockImplementation(
      (cb: (changes: Record<string, StorageChange>, area: string) => void) => {
        capturedListener = cb;
      },
    );
    removeListenerMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('hydrates from storage and listens for changes', async () => {
    const { result, unmount } = renderHook(() => useHeaderStorageSignals());

    await waitFor(() => {
      expect(result.current.lastFetchMs).toBe(5_000);
      expect(result.current.backgroundFetchInProgress).toBe(false);
    });

    expect(capturedListener).toBeDefined();
    capturedListener!(
      {
        [STORAGE_KEY_PR_FETCH_IN_PROGRESS]: { oldValue: false, newValue: true } as StorageChange,
      },
      'local',
    );

    await waitFor(() => {
      expect(result.current.backgroundFetchInProgress).toBe(true);
    });

    unmount();
    expect(removeListenerMock).toHaveBeenCalled();
  });

  it('treats missing last_fetch as null', async () => {
    getResult = { [STORAGE_KEY_PR_FETCH_IN_PROGRESS]: false };
    const { result } = renderHook(() => useHeaderStorageSignals());

    await waitFor(() => {
      expect(result.current.lastFetchMs).toBeNull();
    });
  });
});
