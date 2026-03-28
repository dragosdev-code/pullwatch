import { useState, useRef, useCallback, useEffect } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import { MIN_REFRESH_INTERVAL_MS } from '../../extension/common/constants';
import type { PullRequest } from '../../extension/common/types';

/** Upper bound for indeterminate fetch ring progress (ms) — actual completion snaps to 100%. */
const FETCH_RING_ESTIMATED_MAX_MS = 7000;

const THROTTLED_FLASH_MS = 1000;
const FETCH_COMPLETE_FLASH_MS = 400;

interface UseRateLimitedRefreshOptions {
  refreshPRsMutation: UseMutationResult<PullRequest[], Error, void, unknown>;
  refreshMergedPRsMutation: UseMutationResult<PullRequest[], Error, void, unknown>;
  refreshAuthoredPRsMutation: UseMutationResult<PullRequest[], Error, void, unknown>;
  isLoadingPRs: boolean;
  isLoadingMergedPRs: boolean;
  isLoadingAuthoredPRs: boolean;
  clearGlobalError: () => void;
  setGlobalError: (error: string) => void;
}

interface UseRateLimitedRefreshResult {
  /** Animation state - true when refresh button should show loading animation */
  isRefreshing: boolean;
  /** Combined loading state - true when any refresh operation is in progress */
  isAnyLoading: boolean;
  /** Rate-limited refresh handler - triggers animation always, fetches only if enough time passed */
  handleRefresh: () => Promise<void>;
  /** Time remaining until next refresh is allowed (in milliseconds), updates on tick */
  timeRemainingMs: number;
  /** Whether a refresh can be performed now (time limit has passed) */
  canRefresh: boolean;
  /** True while the three manual refresh mutations are running */
  manualFetchInProgress: boolean;
  /** 0–1 progress for fetch ring (capped until done, then brief 1) */
  fetchProgress01: number;
  /** Elapsed seconds during fetch, for display */
  fetchElapsedSeconds: number;
  /** Duration of the last completed manual fetch (ms), 0 if none yet */
  lastFetchDurationMs: number;
  /** 0–1 = fraction of the 30s cooldown window already elapsed */
  cooldownProgress01: number;
  /** True briefly after a click that did not start a fetch (rate limited) */
  lastInteractionWasThrottled: boolean;
}

/**
 * Hook that provides rate-limited refresh functionality.
 *
 * Features:
 * - Prevents GitHub rate limiting by enforcing minimum 30-second interval between actual fetches
 * - Always shows refresh animation for UX feedback, even when throttled
 * - Coordinates multiple PR type refreshes (assigned, merged, authored)
 * - Handles errors appropriately
 *
 * @param options - Configuration object containing mutations, loading states, and error handlers
 * @returns Rate-limited refresh state and handler
 */
export const useRateLimitedRefresh = ({
  refreshPRsMutation,
  refreshMergedPRsMutation,
  refreshAuthoredPRsMutation,
  isLoadingPRs,
  isLoadingMergedPRs,
  isLoadingAuthoredPRs,
  clearGlobalError,
  setGlobalError,
}: UseRateLimitedRefreshOptions): UseRateLimitedRefreshResult => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastAllowedRefreshAt, setLastAllowedRefreshAt] = useState(0);
  const lastAllowedRefreshAtRef = useRef(0);
  const [tickNow, setTickNow] = useState(() => Date.now());
  const [lastInteractionWasThrottled, setLastInteractionWasThrottled] = useState(false);
  const [fetchCompleteFlash, setFetchCompleteFlash] = useState(false);
  const [lastFetchDurationMs, setLastFetchDurationMs] = useState(0);

  const fetchStartedAtRef = useRef<number>(0);
  const prevManualFetchPendingRef = useRef(false);

  const manualFetchInProgress =
    refreshPRsMutation.isPending ||
    refreshMergedPRsMutation.isPending ||
    refreshAuthoredPRsMutation.isPending;

  // Only tick while a cooldown countdown or fetch-progress animation is active.
  // When idle (no refresh triggered yet), the interval never starts — zero re-renders.
  const needsTick = lastAllowedRefreshAt > 0 || manualFetchInProgress;
  useEffect(() => {
    if (!needsTick) return;
    const id = window.setInterval(() => setTickNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [needsTick]);

  useEffect(() => {
    if (manualFetchInProgress) {
      if (!prevManualFetchPendingRef.current) {
        fetchStartedAtRef.current = Date.now();
      }
      prevManualFetchPendingRef.current = true;
    } else {
      if (prevManualFetchPendingRef.current) {
        const duration = Date.now() - fetchStartedAtRef.current;
        setLastFetchDurationMs(duration);
        setFetchCompleteFlash(true);
        const t = window.setTimeout(() => setFetchCompleteFlash(false), FETCH_COMPLETE_FLASH_MS);
        prevManualFetchPendingRef.current = false;
        return () => window.clearTimeout(t);
      }
      prevManualFetchPendingRef.current = false;
    }
  }, [manualFetchInProgress]);

  const timeSinceLastRefresh = tickNow - lastAllowedRefreshAt;
  const timeRemainingMs = Math.max(0, MIN_REFRESH_INTERVAL_MS - timeSinceLastRefresh);
  const canRefresh = lastAllowedRefreshAt === 0 || timeSinceLastRefresh >= MIN_REFRESH_INTERVAL_MS;

  const cooldownProgress01 =
    lastAllowedRefreshAt === 0
      ? 0
      : Math.min(1, Math.max(0, timeSinceLastRefresh / MIN_REFRESH_INTERVAL_MS));

  let fetchProgress01 = 0;
  let fetchElapsedSeconds = 0;
  if (manualFetchInProgress && fetchStartedAtRef.current > 0) {
    const elapsed = tickNow - fetchStartedAtRef.current;
    fetchElapsedSeconds = elapsed / 1000;
    fetchProgress01 = Math.min(0.94, elapsed / FETCH_RING_ESTIMATED_MAX_MS);
  } else if (fetchCompleteFlash) {
    fetchProgress01 = 1;
  }

  const handleRefresh = useCallback(async () => {
    clearGlobalError();

    setIsRefreshing(true);

    const currentTime = Date.now();
    const timeSinceLast = currentTime - lastAllowedRefreshAtRef.current;

    if (timeSinceLast >= MIN_REFRESH_INTERVAL_MS) {
      setLastInteractionWasThrottled(false);
      lastAllowedRefreshAtRef.current = currentTime;
      setLastAllowedRefreshAt(currentTime);
      try {
        await Promise.all([
          refreshPRsMutation.mutateAsync(),
          refreshMergedPRsMutation.mutateAsync(),
          refreshAuthoredPRsMutation.mutateAsync(),
        ]);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to refresh PRs';
        setGlobalError(errorMessage);
      }
    } else {
      setLastInteractionWasThrottled(true);
      window.setTimeout(() => setLastInteractionWasThrottled(false), THROTTLED_FLASH_MS);
    }

    window.setTimeout(() => {
      setIsRefreshing(false);
    }, 1000);
  }, [
    clearGlobalError,
    refreshPRsMutation,
    refreshMergedPRsMutation,
    refreshAuthoredPRsMutation,
    setGlobalError,
  ]);

  const isAnyLoading =
    isRefreshing ||
    refreshPRsMutation.isPending ||
    isLoadingPRs ||
    refreshMergedPRsMutation.isPending ||
    isLoadingMergedPRs ||
    refreshAuthoredPRsMutation.isPending ||
    isLoadingAuthoredPRs;

  return {
    isRefreshing,
    isAnyLoading,
    handleRefresh,
    timeRemainingMs,
    canRefresh,
    manualFetchInProgress,
    fetchProgress01,
    fetchElapsedSeconds,
    lastFetchDurationMs,
    cooldownProgress01,
    lastInteractionWasThrottled,
  };
};
