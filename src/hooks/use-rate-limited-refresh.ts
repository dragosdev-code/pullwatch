import { useState, useRef, useCallback } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import { MIN_REFRESH_INTERVAL_MS } from '../../extension/common/constants';
import type { PullRequest } from '../../extension/common/types';

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
  /** Time remaining until next refresh is allowed (in milliseconds) */
  timeRemainingMs: number;
  /** Whether a refresh can be performed now (time limit has passed) */
  canRefresh: boolean;
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
export function useRateLimitedRefresh({
  refreshPRsMutation,
  refreshMergedPRsMutation,
  refreshAuthoredPRsMutation,
  isLoadingPRs,
  isLoadingMergedPRs,
  isLoadingAuthoredPRs,
  clearGlobalError,
  setGlobalError,
}: UseRateLimitedRefreshOptions): UseRateLimitedRefreshResult {
  // Local state for controlling refresh animation independently from actual fetch
  const [isRefreshing, setIsRefreshing] = useState(false);
  const lastRefreshTimestampRef = useRef<number>(0);

  const now = Date.now();
  const timeSinceLastRefresh = now - lastRefreshTimestampRef.current;
  const timeRemainingMs = Math.max(0, MIN_REFRESH_INTERVAL_MS - timeSinceLastRefresh);
  const canRefresh = timeSinceLastRefresh >= MIN_REFRESH_INTERVAL_MS;

  const handleRefresh = useCallback(async () => {
    clearGlobalError();

    // Always trigger the animation for UX feedback
    setIsRefreshing(true);

    const currentTime = Date.now();
    const timeSinceLast = currentTime - lastRefreshTimestampRef.current;

    // Only perform actual fetch if enough time has passed (30 seconds)
    if (timeSinceLast >= MIN_REFRESH_INTERVAL_MS) {
      lastRefreshTimestampRef.current = currentTime;
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
    }

    // Keep animation running briefly then turn it off
    // If we're actually fetching, this will be extended by the mutation pending state
    setTimeout(() => {
      setIsRefreshing(false);
    }, 1000);
  }, [
    clearGlobalError,
    refreshPRsMutation,
    refreshMergedPRsMutation,
    refreshAuthoredPRsMutation,
    setGlobalError,
  ]);

  // Combined loading state - true if animation is running or any mutation is pending
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
  };
}
