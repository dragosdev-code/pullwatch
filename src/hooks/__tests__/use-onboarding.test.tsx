import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  STORAGE_KEY_GITHUB_VIEWER_IDENTITY,
  STORAGE_KEY_HAS_SEEN_ONBOARDING,
} from '../../../extension/common/constants';
import { useOnboarding } from '../use-onboarding';

vi.mock('../../services/chrome-extension-service', () => ({
  chromeExtensionService: {
    fetchFreshAssignedPRs: vi.fn().mockResolvedValue([]),
    fetchFreshMergedPRs: vi.fn().mockResolvedValue([]),
    fetchFreshAuthoredPRs: vi.fn().mockResolvedValue([]),
  },
}));

describe('useOnboarding', () => {
  let getMock: ReturnType<typeof vi.fn>;
  let setMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getMock = vi.fn();
    setMock = vi.fn().mockResolvedValue(undefined);

    const addListener = vi.fn();
    const removeListener = vi.fn();

    (
      globalThis as {
        chrome: typeof chrome;
      }
    ).chrome = {
      runtime: { sendMessage: vi.fn(), lastError: undefined },
      storage: {
        local: {
          get: getMock,
          set: setMock,
        },
        onChanged: {
          addListener,
          removeListener,
        },
      },
    } as unknown as typeof chrome;
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete (globalThis as { chrome?: typeof chrome }).chrome;
  });

  it('hydrates storage and shows first-run reveal when logged in and flag unset', async () => {
    getMock.mockResolvedValueOnce({
      [STORAGE_KEY_HAS_SEEN_ONBOARDING]: false,
      [STORAGE_KEY_GITHUB_VIEWER_IDENTITY]: { login: 'alice' },
    });

    const { result } = renderHook(() => useOnboarding());

    await waitFor(() => expect(result.current.storageReady).toBe(true));

    expect(result.current.isLoggedIn).toBe(true);
    expect(result.current.showFirstRunReveal).toBe(true);
    expect(result.current.showLoggedOutLayer).toBe(false);
    expect(result.current.mainAppInert).toBe(true);
  });

  it('persists has_seen_onboarding when markRevealComplete runs', async () => {
    getMock.mockResolvedValueOnce({
      [STORAGE_KEY_HAS_SEEN_ONBOARDING]: false,
      [STORAGE_KEY_GITHUB_VIEWER_IDENTITY]: { login: 'alice' },
    });

    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => expect(result.current.storageReady).toBe(true));

    await act(async () => {
      result.current.markRevealComplete();
    });

    await waitFor(() => expect(setMock).toHaveBeenCalledWith({ [STORAGE_KEY_HAS_SEEN_ONBOARDING]: true }));
    expect(result.current.hasSeenOnboarding).toBe(true);
    expect(result.current.showFirstRunReveal).toBe(false);
  });

  it('shows logged-out layer when identity missing', async () => {
    getMock.mockResolvedValueOnce({
      [STORAGE_KEY_HAS_SEEN_ONBOARDING]: true,
      [STORAGE_KEY_GITHUB_VIEWER_IDENTITY]: undefined,
    });

    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => expect(result.current.storageReady).toBe(true));

    expect(result.current.isLoggedIn).toBe(false);
    expect(result.current.showLoggedOutLayer).toBe(true);
  });
});
