import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { UseMutationResult } from '@tanstack/react-query';
import type { PullRequest } from '@common/types';
import { MIN_REFRESH_INTERVAL_MS } from '@common/constants';
import { useRateLimitedRefresh } from '../use-rate-limited-refresh';

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

interface HookInput {
  mutations: Mutations;
  lastFetchMs: number | null;
  backgroundFetchInProgress: boolean;
  clearGlobalError: () => void;
  setGlobalError: (msg: string) => void;
}

const renderRateLimited = (initial: HookInput) =>
  renderHook(
    (props: HookInput) =>
      useRateLimitedRefresh({
        ...props.mutations,
        isLoadingPRs: false,
        isLoadingMergedPRs: false,
        isLoadingAuthoredPRs: false,
        clearGlobalError: props.clearGlobalError,
        setGlobalError: props.setGlobalError,
        lastFetchMs: props.lastFetchMs,
        backgroundFetchInProgress: props.backgroundFetchInProgress,
      }),
    { initialProps: initial }
  );

const T_START_MS = 1_700_000_000_000;

describe('useRateLimitedRefresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T_START_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('is ready immediately when no fetch has ever completed (lastFetchMs=null)', () => {
    const mutations = createMutations();
    const { result } = renderRateLimited({
      mutations,
      lastFetchMs: null,
      backgroundFetchInProgress: false,
      clearGlobalError: vi.fn(),
      setGlobalError: vi.fn(),
    });

    expect(result.current.canRefresh).toBe(true);
    expect(result.current.timeRemainingMs).toBe(0);
    expect(result.current.cooldownProgress01).toBe(0);
  });

  it('anchors the 30s cooldown on lastFetchMs (completion), not on click time', async () => {
    const mutations = createMutations();
    const setGlobalError = vi.fn();
    const clearGlobalError = vi.fn();

    const { result, rerender } = renderRateLimited({
      mutations,
      lastFetchMs: null,
      backgroundFetchInProgress: false,
      clearGlobalError,
      setGlobalError,
    });

    expect(result.current.canRefresh).toBe(true);

    // Manual click fires all three mutations
    await act(async () => {
      await result.current.handleRefresh();
    });

    expect(mutations.refreshPRsMutation.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutations.refreshMergedPRsMutation.mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutations.refreshAuthoredPRsMutation.mutateAsync).toHaveBeenCalledTimes(1);

    // Pretend backend wrote last_fetch_time at the click instant (fetch resolved synchronously here)
    const completionAt = T_START_MS;
    rerender({
      mutations,
      lastFetchMs: completionAt,
      backgroundFetchInProgress: false,
      clearGlobalError,
      setGlobalError,
    });

    expect(result.current.canRefresh).toBe(false);
    expect(result.current.timeRemainingMs).toBe(MIN_REFRESH_INTERVAL_MS);

    // Second click during cooldown is throttled — no new mutations
    await act(async () => {
      await result.current.handleRefresh();
    });
    expect(mutations.refreshPRsMutation.mutateAsync).toHaveBeenCalledTimes(1);
    expect(result.current.lastInteractionWasThrottled).toBe(true);

    // Cooldown elapses 30s after completion
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

  it('disables the button and reports fetching while a background (alarm) fetch is in flight', async () => {
    const mutations = createMutations();
    const setGlobalError = vi.fn();
    const clearGlobalError = vi.fn();

    const { result, rerender } = renderRateLimited({
      mutations,
      lastFetchMs: null,
      backgroundFetchInProgress: false,
      clearGlobalError,
      setGlobalError,
    });

    expect(result.current.canRefresh).toBe(true);

    // Alarm fetch starts (no manual mutations pending)
    rerender({
      mutations,
      lastFetchMs: null,
      backgroundFetchInProgress: true,
      clearGlobalError,
      setGlobalError,
    });

    expect(result.current.canRefresh).toBe(false);
    expect(result.current.manualFetchInProgress).toBe(false);
    expect(result.current.backgroundFetchInProgress).toBe(true);
    // No fetch ring for alarm-driven fetches — only the manual click path animates the ring.
    expect(result.current.fetchProgress01).toBe(0);
    expect(result.current.fetchElapsedSeconds).toBe(0);

    // Click during alarm fetch is throttled — no manual mutations fire
    await act(async () => {
      await result.current.handleRefresh();
    });
    expect(mutations.refreshPRsMutation.mutateAsync).not.toHaveBeenCalled();
    expect(result.current.lastInteractionWasThrottled).toBe(true);

    // Ring stays at zero even after time passes
    await act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.fetchProgress01).toBe(0);
    expect(result.current.fetchElapsedSeconds).toBe(0);

    // Alarm completes, lastFetchMs jumps to now, cooldown engages
    const completionAt = T_START_MS + 500;
    rerender({
      mutations,
      lastFetchMs: completionAt,
      backgroundFetchInProgress: false,
      clearGlobalError,
      setGlobalError,
    });

    expect(result.current.canRefresh).toBe(false);
    expect(result.current.backgroundFetchInProgress).toBe(false);
    expect(result.current.timeRemainingMs).toBe(MIN_REFRESH_INTERVAL_MS);

    await act(() => {
      vi.advanceTimersByTime(MIN_REFRESH_INTERVAL_MS + 250);
    });
    expect(result.current.canRefresh).toBe(true);
  });
});
