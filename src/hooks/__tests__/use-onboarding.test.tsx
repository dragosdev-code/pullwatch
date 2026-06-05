import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  STORAGE_KEY_GITHUB_VIEWER_IDENTITY,
  STORAGE_KEY_HAS_SEEN_ONBOARDING,
  STORAGE_KEY_ONBOARDING_REAUTH_GATE_PENDING,
} from '@common/constants';
import { queryKeys } from '@src/constants/query-keys';
import { useOnboarding } from '../use-onboarding';
import {
  chromeExtensionService,
  type StorageChange,
} from '@common/chrome-extension-service';

const getMock = vi.fn();
const setMock = vi.fn().mockResolvedValue(undefined);
const removeMock = vi.fn().mockResolvedValue(undefined);
const addListenerMock = vi.fn();
const removeListenerMock = vi.fn();

vi.mock('@common/chrome-extension-service', () => ({
  chromeExtensionService: {
    isExtensionContext: vi.fn(() => true),
    prs: {
      fetchFreshAssigned: vi.fn().mockResolvedValue([]),
      fetchFreshMerged: vi.fn().mockResolvedValue([]),
      fetchFreshAuthored: vi.fn().mockResolvedValue([]),
    },
    storage: {
      local: {
        get: (...args: unknown[]) => getMock(...args),
        set: (...args: unknown[]) => setMock(...args),
        remove: (...args: unknown[]) => removeMock(...args),
      },
      onChanged: {
        addListener: (cb: unknown) => addListenerMock(cb),
        removeListener: (cb: unknown) => removeListenerMock(cb),
      },
    },
  },
}));

describe('useOnboarding', () => {
  let queryClient: QueryClient;
  let storageListener:
    | ((changes: Record<string, StorageChange>, area: string) => void)
    | undefined;

  const createWrapper = (client: QueryClient) => {
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    return Wrapper;
  };

  const renderOnboardingHook = () =>
    renderHook(() => useOnboarding(), {
      wrapper: createWrapper(queryClient),
    });

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    getMock.mockReset();
    setMock.mockReset().mockResolvedValue(undefined);
    removeMock.mockReset().mockResolvedValue(undefined);
    addListenerMock.mockReset();
    removeListenerMock.mockReset();
    storageListener = undefined;

    addListenerMock.mockImplementation(
      (cb: (changes: Record<string, StorageChange>, area: string) => void) => {
        storageListener = cb;
      }
    );
  });

  afterEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  it('hydrates storage and shows first-run reveal when logged in and flag unset', async () => {
    getMock.mockResolvedValueOnce({
      [STORAGE_KEY_HAS_SEEN_ONBOARDING]: false,
      [STORAGE_KEY_GITHUB_VIEWER_IDENTITY]: { login: 'alice' },
    });

    const { result } = renderOnboardingHook();

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

    const { result } = renderOnboardingHook();
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

    const { result } = renderOnboardingHook();
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

    const { result } = renderOnboardingHook();
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

    const { result } = renderOnboardingHook();
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

  it('clears viewer-scoped PR caches when viewer identity changes', async () => {
    getMock.mockResolvedValueOnce({
      [STORAGE_KEY_HAS_SEEN_ONBOARDING]: true,
      [STORAGE_KEY_GITHUB_VIEWER_IDENTITY]: { login: 'alice' },
    });
    queryClient.setQueryData(queryKeys.assignedPrs, [{ id: 'assigned-alice' }]);
    queryClient.setQueryData(queryKeys.mergedPrs, [{ id: 'merged-alice' }]);
    queryClient.setQueryData(queryKeys.authoredPrs, [{ id: 'authored-alice' }]);

    const { result } = renderOnboardingHook();
    await waitFor(() => expect(result.current.storageReady).toBe(true));

    expect(storageListener).toBeDefined();
    await act(async () => {
      storageListener!(
        {
          [STORAGE_KEY_GITHUB_VIEWER_IDENTITY]: {
            oldValue: { login: 'alice', updatedAt: '2020-01-01T00:00:00.000Z' },
            newValue: { login: 'bob', updatedAt: '2020-01-01T00:00:01.000Z' },
          },
        },
        'local'
      );
    });

    expect(queryClient.getQueryData(queryKeys.assignedPrs)).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.mergedPrs)).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.authoredPrs)).toBeUndefined();
    expect(result.current.isLoggedIn).toBe(true);
  });

  it('does not clear PR caches on first login (null -> login)', async () => {
    // No identity at boot; the install/alarm wave persists this viewer's lists *before*
    // the identity key, so by the time the null -> login event lands the caches already
    // hold the correct data (applied by usePrListsStorageSync). The first login is not a
    // swap and must not wipe them.
    getMock.mockResolvedValueOnce({
      [STORAGE_KEY_HAS_SEEN_ONBOARDING]: false,
    });
    queryClient.setQueryData(queryKeys.assignedPrs, [{ id: 'assigned-alice' }]);
    queryClient.setQueryData(queryKeys.mergedPrs, [{ id: 'merged-alice' }]);
    queryClient.setQueryData(queryKeys.authoredPrs, [{ id: 'authored-alice' }]);

    const { result } = renderOnboardingHook();
    await waitFor(() => expect(result.current.storageReady).toBe(true));

    expect(storageListener).toBeDefined();
    await act(async () => {
      storageListener!(
        {
          [STORAGE_KEY_GITHUB_VIEWER_IDENTITY]: {
            oldValue: undefined,
            newValue: { login: 'alice', updatedAt: '2020-01-01T00:00:00.000Z' },
          },
        },
        'local'
      );
    });

    expect(queryClient.getQueryData(queryKeys.assignedPrs)).toEqual([{ id: 'assigned-alice' }]);
    expect(queryClient.getQueryData(queryKeys.mergedPrs)).toEqual([{ id: 'merged-alice' }]);
    expect(queryClient.getQueryData(queryKeys.authoredPrs)).toEqual([{ id: 'authored-alice' }]);
    expect(result.current.isLoggedIn).toBe(true);
  });

  it('clears PR caches on logout (login -> null)', async () => {
    getMock.mockResolvedValueOnce({
      [STORAGE_KEY_HAS_SEEN_ONBOARDING]: true,
      [STORAGE_KEY_GITHUB_VIEWER_IDENTITY]: { login: 'alice' },
    });
    queryClient.setQueryData(queryKeys.assignedPrs, [{ id: 'assigned-alice' }]);
    queryClient.setQueryData(queryKeys.mergedPrs, [{ id: 'merged-alice' }]);
    queryClient.setQueryData(queryKeys.authoredPrs, [{ id: 'authored-alice' }]);

    const { result } = renderOnboardingHook();
    await waitFor(() => expect(result.current.storageReady).toBe(true));

    expect(storageListener).toBeDefined();
    await act(async () => {
      storageListener!(
        {
          [STORAGE_KEY_GITHUB_VIEWER_IDENTITY]: {
            oldValue: { login: 'alice', updatedAt: '2020-01-01T00:00:00.000Z' },
            newValue: undefined,
          },
        },
        'local'
      );
    });

    expect(queryClient.getQueryData(queryKeys.assignedPrs)).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.mergedPrs)).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.authoredPrs)).toBeUndefined();
    expect(result.current.isLoggedIn).toBe(false);
  });

  it('sets friendly refresh info when session refresh rejects with NotLoggedIn', async () => {
    const matchMediaSpy = vi.spyOn(window, 'matchMedia').mockImplementation(
      () =>
        ({
          matches: true,
          media: '(prefers-reduced-motion: reduce)',
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList
    );
    try {
      getMock.mockResolvedValue({
        [STORAGE_KEY_HAS_SEEN_ONBOARDING]: true,
        [STORAGE_KEY_GITHUB_VIEWER_IDENTITY]: undefined,
      });
      const authErr = new Error('NotLoggedIn: User is not logged in to GitHub.');
      vi.mocked(chromeExtensionService.prs.fetchFreshAssigned).mockRejectedValueOnce(authErr);
      vi.mocked(chromeExtensionService.prs.fetchFreshMerged).mockRejectedValueOnce(authErr);
      vi.mocked(chromeExtensionService.prs.fetchFreshAuthored).mockRejectedValueOnce(authErr);

      const { result } = renderOnboardingHook();
      await waitFor(() => expect(result.current.storageReady).toBe(true));

      await act(async () => {
        await result.current.refreshGitHubSession();
      });

      expect(result.current.refreshErrorMessage).toBeNull();
      expect(result.current.refreshState).toBe('idle');
      expect(result.current.refreshInfoMessage).toContain(
        'does not detect a signed-in GitHub session'
      );
    } finally {
      matchMediaSpy.mockRestore();
    }
  });
});
