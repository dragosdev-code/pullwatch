import { MIN_REFRESH_INTERVAL_MS } from '@common/constants';
import type { DerivedRefreshDisplay, RefreshButtonProps, RefreshRingPhase } from '../types';

export const resolvePhase = (
  manualFetchInProgress: boolean,
  backgroundFetchInProgress: boolean,
  lastInteractionWasThrottled: boolean,
  canRefresh: boolean,
  timeRemainingMs: number
): RefreshRingPhase => {
  if (manualFetchInProgress) return 'fetching';
  if (backgroundFetchInProgress) return 'background';
  if (lastInteractionWasThrottled) return 'throttled';
  if (!canRefresh && timeRemainingMs > 0) return 'cooldown';
  return 'ready';
};

const computeRingProgress01 = (props: RefreshButtonProps): number => {
  const {
    manualFetchInProgress,
    backgroundFetchInProgress,
    fetchProgress01,
    cooldownProgress01,
    lastInteractionWasThrottled,
    canRefresh,
    timeRemainingMs,
  } = props;
  if (manualFetchInProgress) return fetchProgress01;
  // WHY [no ring during alarm]: alarm fetches are not user-initiated — the button shows only a
  // disabled state plus a tooltip explaining the background sync. The cooldown ring resumes
  // naturally once the alarm completes and `lastFetchMs` updates.
  if (backgroundFetchInProgress) return 0;
  if (fetchProgress01 >= 0.99) return 1;
  if (lastInteractionWasThrottled) return cooldownProgress01;
  if (!canRefresh && timeRemainingMs > 0) return cooldownProgress01;
  return 0;
};

const computeRingStrokeClass = (props: RefreshButtonProps): string => {
  const { manualFetchInProgress, backgroundFetchInProgress, fetchProgress01, canRefresh } = props;
  if (manualFetchInProgress || fetchProgress01 >= 0.99) return 'stroke-primary';
  if (backgroundFetchInProgress) return 'stroke-transparent';
  const refreshBlockedByCooldown = !canRefresh && !manualFetchInProgress;
  if (refreshBlockedByCooldown) return 'stroke-warning';
  return 'stroke-transparent';
};

const computeTooltipLines = (
  props: RefreshButtonProps,
  cooldownActive: boolean,
  secondsLeft: number
): string[] => {
  const {
    manualFetchInProgress,
    backgroundFetchInProgress,
    lastInteractionWasThrottled,
    fetchElapsedSeconds,
    lastFetchDurationMs,
  } = props;
  if (manualFetchInProgress) {
    return ['Refreshing all PR lists…', `${fetchElapsedSeconds.toFixed(1)}s elapsed`];
  }
  if (backgroundFetchInProgress) {
    return ['Auto-refresh in progress', 'Manual refresh paused while background sync runs'];
  }
  if (lastInteractionWasThrottled) {
    return ['Did not refetch (rate limit)', `Try again in ${secondsLeft}s`];
  }
  if (cooldownActive) {
    return ['Manual refresh on cooldown', `${secondsLeft}s until available`];
  }
  if (lastFetchDurationMs > 0) {
    return [
      'Refresh "to review", "authored" & "merged" PRs',
      `Last fetch: ${(lastFetchDurationMs / 1000).toFixed(1)}s`,
    ];
  }
  return [
    'Refresh "to review", "authored" & "merged" PRs',
    `Max once per ${MIN_REFRESH_INTERVAL_MS / 1000}s`,
  ];
};

const computeShortAriaLabel = (
  manualFetchInProgress: boolean,
  backgroundFetchInProgress: boolean,
  cooldownActive: boolean,
  lastInteractionWasThrottled: boolean
): string => {
  if (manualFetchInProgress) return 'Refreshing pull requests';
  if (backgroundFetchInProgress) return 'Auto-refresh running — manual refresh paused';
  if (cooldownActive || lastInteractionWasThrottled) return 'Refresh on cooldown';
  return 'Refresh pull requests';
};

export const deriveRefreshDisplay = (props: RefreshButtonProps): DerivedRefreshDisplay => {
  const {
    manualFetchInProgress,
    backgroundFetchInProgress,
    canRefresh,
    timeRemainingMs,
    lastInteractionWasThrottled,
  } = props;
  // WHY [`backgroundOnly`]: the background service worker mirrors `pr_fetch_in_progress=true` for
  // BOTH alarm and manual fetches, so `backgroundFetchInProgress` is true during manual fetches
  // too. The alarm-only visual treatment (no ring, no seconds, distinct tooltip) must apply only
  // when there is no manual mutation in flight — otherwise it would mask the manual fetch ring.
  const backgroundOnly = backgroundFetchInProgress && !manualFetchInProgress;
  const cooldownActive = !canRefresh && timeRemainingMs > 0 && !backgroundOnly;
  const refreshDisabled = manualFetchInProgress || backgroundFetchInProgress || !canRefresh;
  const secondsLeft = Math.ceil(timeRemainingMs / 1000);
  const phase = resolvePhase(
    manualFetchInProgress,
    backgroundOnly,
    lastInteractionWasThrottled,
    canRefresh,
    timeRemainingMs
  );
  const ringProgress01 = computeRingProgress01({
    ...props,
    backgroundFetchInProgress: backgroundOnly,
  });
  const ringStrokeClass = computeRingStrokeClass({
    ...props,
    backgroundFetchInProgress: backgroundOnly,
  });
  const tooltipLines = computeTooltipLines(
    { ...props, backgroundFetchInProgress: backgroundOnly },
    cooldownActive,
    secondsLeft
  );
  const shortAriaLabel = computeShortAriaLabel(
    manualFetchInProgress,
    backgroundOnly,
    cooldownActive,
    lastInteractionWasThrottled
  );
  // Hidden only when background-only (alarm). Manual fetch + cooldown both show seconds.
  const showSeconds =
    !backgroundOnly && (manualFetchInProgress || cooldownActive || lastInteractionWasThrottled);

  return {
    phase,
    ringProgress01,
    ringStrokeClass,
    tooltipLines,
    shortAriaLabel,
    showSeconds,
    secondsLeft,
    refreshDisabled,
    cooldownActive,
  };
};
