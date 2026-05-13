import { useState, useRef, useCallback, useEffect } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import { MIN_REFRESH_INTERVAL_MS } from '@common/constants';
import type { PullRequest } from '@common/types';

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
  /** Last successful fetch completion timestamp (chrome.storage.local last_fetch_time). Drives cooldown + freshness on one clock. */
  lastFetchMs: number | null;
  /** True while the background service worker reports an alarm-driven (non-manual) fetch in flight. */
  backgroundFetchInProgress: boolean;
}

interface UseRateLimitedRefreshResult {
  /** True while refresh button should show its loading animation (briefly after a manual click). */
  isRefreshing: boolean;
  /** Combined loading state - true when any refresh operation is in progress */
  isAnyLoading: boolean;
  /** Rate-limited refresh handler - triggers animation always, fetches only if enough time passed */
  handleRefresh: () => Promise<void>;
  /** Time remaining until next refresh is allowed (in milliseconds), updates on tick */
  timeRemainingMs: number;
  /** Whether a refresh can be performed now (time limit has passed, no fetch in flight) */
  canRefresh: boolean;
  /** True while the three manual-refresh mutations are running. Drives the fetch ring visual. */
  manualFetchInProgress: boolean;
  /** True while an alarm-driven background fetch is in flight. Disables the button without showing the fetch ring. */
  backgroundFetchInProgress: boolean;
  /** 0–1 progress for fetch ring (capped until done, then brief 1) — manual fetches only */
  fetchProgress01: number;
  /** Elapsed seconds during a manual fetch, for display */
  fetchElapsedSeconds: number;
  /** Duration of the last completed manual fetch (ms), 0 if none yet */
  lastFetchDurationMs: number;
  /** 0–1 = fraction of the 30s cooldown window already elapsed since last fetch completion */
  cooldownProgress01: number;
  /** True briefly after a click that did not start a fetch (rate limited) */
  lastInteractionWasThrottled: boolean;
}

/**
 * Rate-limited refresh state.
 *
 * Cooldown + freshness share one clock: `lastFetchMs` (last successful fetch completion, written
 * to chrome.storage.local by the background for both alarm and manual paths). The button is
 * disabled while ANY fetch is in flight (alarm or manual) and for `MIN_REFRESH_INTERVAL_MS` after
 * completion. The fetch ring visual is reserved for manual fetches; alarm fetches show only a
 * disabled state with a distinct tooltip.
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
  lastFetchMs,
  backgroundFetchInProgress,
}: UseRateLimitedRefreshOptions): UseRateLimitedRefreshResult => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tickNow, setTickNow] = useState(() => Date.now());
  const [lastInteractionWasThrottled, setLastInteractionWasThrottled] = useState(false);
  const [fetchCompleteFlash, setFetchCompleteFlash] = useState(false);
  const [lastFetchDurationMs, setLastFetchDurationMs] = useState(0);
  // WHY [storage-lag fallback]: chrome.storage.onChanged for `last_fetch_time` can land after a
  // mutateAsync resolves; without this we'd briefly read the OLD `lastFetchMs` after completion
  // and let a second click slip through. Bumped on every fetch end edge (manual or alarm) so the
  // cooldown engages immediately and converges with `lastFetchMs` once the storage write arrives.
  const [optimisticLastFetchAtMs, setOptimisticLastFetchAtMs] = useState(0);

  const manualFetchStartedAtRef = useRef<number>(0);
  const prevManualPendingRef = useRef(false);
  const prevAnyFetchPendingRef = useRef(false);

  const manualFetchInProgress =
    refreshPRsMutation.isPending ||
    refreshMergedPRsMutation.isPending ||
    refreshAuthoredPRsMutation.isPending;

  const anyFetchInProgress = manualFetchInProgress || backgroundFetchInProgress;

  const effectiveLastFetchMs = Math.max(lastFetchMs ?? 0, optimisticLastFetchAtMs);
  const hasFetchReference = effectiveLastFetchMs > 0;
  const timeSinceLastFetch = hasFetchReference
    ? tickNow - effectiveLastFetchMs
    : Number.POSITIVE_INFINITY;
  const timeRemainingMs = hasFetchReference
    ? Math.max(0, MIN_REFRESH_INTERVAL_MS - timeSinceLastFetch)
    : 0;
  const canRefresh = !anyFetchInProgress && timeRemainingMs === 0;

  const cooldownProgress01 = hasFetchReference
    ? Math.min(1, Math.max(0, timeSinceLastFetch / MIN_REFRESH_INTERVAL_MS))
    : 0;

  // Tick whenever the cooldown ring or the manual-fetch ring needs to animate.
  // Pure-background fetches don't need ticking (no ring) — `canRefresh` flips on the next render
  // because `anyFetchInProgress` is a derived input.
  const needsTick = (hasFetchReference && timeRemainingMs > 0) || manualFetchInProgress;
  useEffect(() => {
    if (!needsTick) return;
    const cooldownTickIntervalId = window.setInterval(() => setTickNow(Date.now()), 250);
    return () => window.clearInterval(cooldownTickIntervalId);
  }, [needsTick]);

  // Manual-only edge: records fetch start for the elapsed-seconds label, captures duration on
  // completion (for tooltip), and triggers the brief 100% ring snap.
  useEffect(() => {
    if (manualFetchInProgress) {
      if (!prevManualPendingRef.current) {
        manualFetchStartedAtRef.current = Date.now();
      }
      prevManualPendingRef.current = true;
      return;
    }
    if (prevManualPendingRef.current) {
      const fetchDurationMs = Date.now() - manualFetchStartedAtRef.current;
      setLastFetchDurationMs(fetchDurationMs);
      setFetchCompleteFlash(true);
      const fetchCompleteFlashTimeoutId = window.setTimeout(
        () => setFetchCompleteFlash(false),
        FETCH_COMPLETE_FLASH_MS
      );
      prevManualPendingRef.current = false;
      return () => window.clearTimeout(fetchCompleteFlashTimeoutId);
    }
    prevManualPendingRef.current = false;
  }, [manualFetchInProgress]);

  // Any-fetch edge: bumps the optimistic cooldown baseline whenever ANY fetch ends, so the
  // button stays locked through the 30s window after alarm completions too. Also resyncs
  // `tickNow` so cooldown math doesn't read a stale clock between the completion edge and the
  // first interval tick.
  useEffect(() => {
    if (anyFetchInProgress) {
      prevAnyFetchPendingRef.current = true;
      return;
    }
    if (prevAnyFetchPendingRef.current) {
      const endedAt = Date.now();
      setOptimisticLastFetchAtMs(endedAt);
      setTickNow(endedAt);
      prevAnyFetchPendingRef.current = false;
    }
  }, [anyFetchInProgress]);

  let fetchProgress01 = 0;
  let fetchElapsedSeconds = 0;
  if (manualFetchInProgress && manualFetchStartedAtRef.current > 0) {
    const fetchElapsedMs = tickNow - manualFetchStartedAtRef.current;
    fetchElapsedSeconds = fetchElapsedMs / 1000;
    fetchProgress01 = Math.min(0.94, fetchElapsedMs / FETCH_RING_ESTIMATED_MAX_MS);
  } else if (fetchCompleteFlash) {
    fetchProgress01 = 1;
  }

  const handleRefresh = useCallback(async () => {
    clearGlobalError();

    setIsRefreshing(true);

    const referenceMs = Math.max(lastFetchMs ?? 0, optimisticLastFetchAtMs);
    const clickAllowed =
      !anyFetchInProgress &&
      (referenceMs === 0 || Date.now() - referenceMs >= MIN_REFRESH_INTERVAL_MS);

    if (clickAllowed) {
      setLastInteractionWasThrottled(false);
      try {
        await Promise.all([
          refreshPRsMutation.mutateAsync(),
          refreshMergedPRsMutation.mutateAsync(),
          refreshAuthoredPRsMutation.mutateAsync(),
        ]);
      } catch (mutationError) {
        const errorMessage =
          mutationError instanceof Error ? mutationError.message : 'Failed to refresh PRs';
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
    anyFetchInProgress,
    lastFetchMs,
    optimisticLastFetchAtMs,
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
    backgroundFetchInProgress,
    fetchProgress01,
    fetchElapsedSeconds,
    lastFetchDurationMs,
    cooldownProgress01,
    lastInteractionWasThrottled,
  };
};
