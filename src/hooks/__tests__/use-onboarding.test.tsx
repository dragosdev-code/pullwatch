import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
  STORAGE_KEY_GITHUB_VIEWER_IDENTITY,
  STORAGE_KEY_HAS_SEEN_ONBOARDING,
  STORAGE_KEY_ONBOARDING_REAUTH_GATE_PENDING,
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
  let removeMock: ReturnType<typeof vi.fn>;
  let storageListener:
    | ((changes: Record<string, chrome.storage.StorageChange>, area: string) => void)
    | undefined;

  beforeEach(() => {
    getMock = vi.fn();
    setMock = vi.fn().mockResolvedValue(undefined);
    removeMock = vi.fn().mockResolvedValue(undefined);
    storageListener = undefined;

    const addListener = vi.fn(
      (cb: (changes: Record<string, chrome.storage.StorageChange>, area: string) => void) => {
        storageListener = cb;
      }
    );
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
          remove: removeMock,
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
    await waitFor(() =>
      expect(removeMock).toHaveBeenCalledWith(STORAGE_KEY_ONBOARDING_REAUTH_GATE_PENDING)
    );
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

  it('shows reveal when reauth gate pending even if has_seen_onboarding is true', async () => {
    getMock.mockResolvedValueOnce({
      [STORAGE_KEY_HAS_SEEN_ONBOARDING]: true,
      [STORAGE_KEY_GITHUB_VIEWER_IDENTITY]: { login: 'alice' },
      [STORAGE_KEY_ONBOARDING_REAUTH_GATE_PENDING]: true,
    });

    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => expect(result.current.storageReady).toBe(true));

    expect(result.current.isLoggedIn).toBe(true);
    expect(result.current.showFirstRunReveal).toBe(true);
    expect(result.current.mainAppInert).toBe(true);
  });

  it('shows reveal after logged-out mount when identity arrives and has_seen_onboarding is true', async () => {
    getMock.mockResolvedValueOnce({
      [STORAGE_KEY_HAS_SEEN_ONBOARDING]: true,
      [STORAGE_KEY_GITHUB_VIEWER_IDENTITY]: undefined,
      [STORAGE_KEY_ONBOARDING_REAUTH_GATE_PENDING]: false,
    });

    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => expect(result.current.showLoggedOutLayer).toBe(true));

    expect(storageListener).toBeDefined();
    await act(async () => {
      storageListener!(
        {
          [STORAGE_KEY_GITHUB_VIEWER_IDENTITY]: {
            oldValue: undefined,
            newValue: { login: 'bob', updatedAt: '2020-01-01T00:00:00.000Z' },
          },
        },
        'local'
      );
    });

    await waitFor(() => expect(result.current.showFirstRunReveal).toBe(true));
    expect(result.current.showLoggedOutLayer).toBe(false);
  });
});
