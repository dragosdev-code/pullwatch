import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { UseMutationResult } from '@tanstack/react-query';
import type { PullRequest } from '@common/types';
import { MIN_REFRESH_INTERVAL_MS } from '@common/constants';
import { useRateLimitedRefresh } from '../use-rate-limited-refresh';

vi.mock('@common/chrome-extension-service', () => ({
  chromeExtensionService: {
    isExtensionContext: () => false,
    storage: {
      session: {
        get: vi.fn(),
      },
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
  },
}));

type Mutations = {
  refreshPRsMutation: UseMutationResult<PullRequest[], Error, void, unknown>;
  refreshMergedPRsMutation: UseMutationResult<PullRequest[], Error, void, unknown>;
  refreshAuthoredPRsMutation: UseMutationResult<PullRequest[], Error, void, unknown>;
};

function createMutations(): Mutations {
  const refreshPRsMutation = {
    isPending: false,
    mutateAsync: vi.fn().mockResolvedValue([]),
  };
  const refreshMergedPRsMutation = {
    isPending: false,
    mutateAsync: vi.fn().mockResolvedValue([]),
  };
  const refreshAuthoredPRsMutation = {
    isPending: false,
    mutateAsync: vi.fn().mockResolvedValue([]),
  };
  return {
    refreshPRsMutation: refreshPRsMutation as unknown as Mutations['refreshPRsMutation'],
    refreshMergedPRsMutation:
      refreshMergedPRsMutation as unknown as Mutations['refreshMergedPRsMutation'],
    refreshAuthoredPRsMutation:
      refreshAuthoredPRsMutation as unknown as Mutations['refreshAuthoredPRsMutation'],
  };
}

const T_START_MS = 1_700_000_000_000;

describe('Manual refresh when GitHub is rate limiting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T_START_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a clear backoff state and prevents hammering refresh until the limit window passes', async () => {
    const mutations = createMutations();
    const clearGlobalError = vi.fn();
    const setGlobalError = vi.fn();

    const { result } = renderHook(() =>
      useRateLimitedRefresh({
        ...mutations,
        isLoadingPRs: false,
        isLoadingMergedPRs: false,
        isLoadingAuthoredPRs: false,
        clearGlobalError,
        setGlobalError,
      }),
    );

    expect(result.current.canRefresh).toBe(true);
    expect(result.current.timeRemainingMs).toBe(0);

    await act(async () => {
      await result.current.handleRefresh();
    });

    expect(mutations.refreshPRsMutation.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutations.refreshMergedPRsMutation.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutations.refreshAuthoredPRsMutation.mutateAsync).toHaveBeenCalledTimes(1);

    expect(result.current.canRefresh).toBe(false);
    expect(result.current.timeRemainingMs).toBe(MIN_REFRESH_INTERVAL_MS);

    await act(async () => {
      await result.current.handleRefresh();
    });

    expect(mutations.refreshPRsMutation.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutations.refreshMergedPRsMutation.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutations.refreshAuthoredPRsMutation.mutateAsync).toHaveBeenCalledTimes(1);
    expect(result.current.lastInteractionWasThrottled).toBe(true);

    await act(() => {
      vi.advanceTimersByTime(MIN_REFRESH_INTERVAL_MS + 250);
    });

    expect(result.current.canRefresh).toBe(true);
    expect(result.current.timeRemainingMs).toBe(0);

    await act(async () => {
      await result.current.handleRefresh();
    });

    expect(mutations.refreshPRsMutation.mutateAsync).toHaveBeenCalledTimes(2);
    expect(mutations.refreshMergedPRsMutation.mutateAsync).toHaveBeenCalledTimes(2);
    expect(mutations.refreshAuthoredPRsMutation.mutateAsync).toHaveBeenCalledTimes(2);
  });
});
