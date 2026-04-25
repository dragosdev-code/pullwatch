import { MIN_REFRESH_INTERVAL_MS } from '@common/constants';
import type { DerivedRefreshDisplay, RefreshButtonProps, RefreshRingPhase } from '../types';

export const resolvePhase = (
  manualFetchInProgress: boolean,
  lastInteractionWasThrottled: boolean,
  canRefresh: boolean,
  timeRemainingMs: number
): RefreshRingPhase => {
  if (manualFetchInProgress) return 'fetching';
  if (lastInteractionWasThrottled) return 'throttled';
  if (!canRefresh && timeRemainingMs > 0) return 'cooldown';
  return 'ready';
};

const computeRingProgress01 = (props: RefreshButtonProps): number => {
  const {
    manualFetchInProgress,
    fetchProgress01,
    cooldownProgress01,
    lastInteractionWasThrottled,
    canRefresh,
    timeRemainingMs,
  } = props;
  if (manualFetchInProgress) return fetchProgress01;
  if (fetchProgress01 >= 0.99) return 1;
  if (lastInteractionWasThrottled) return cooldownProgress01;
  if (!canRefresh && timeRemainingMs > 0) return cooldownProgress01;
  return 0;
};

const computeRingStrokeClass = (props: RefreshButtonProps): string => {
  const { manualFetchInProgress, fetchProgress01, canRefresh } = props;
  const refreshBlockedByCooldown = !canRefresh && !manualFetchInProgress;
  if (manualFetchInProgress || fetchProgress01 >= 0.99) return 'stroke-primary';
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
    lastInteractionWasThrottled,
    fetchElapsedSeconds,
    lastFetchDurationMs,
  } = props;
  if (manualFetchInProgress) {
    return ['Refreshing all PR lists…', `${fetchElapsedSeconds.toFixed(1)}s elapsed`];
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
  cooldownActive: boolean,
  lastInteractionWasThrottled: boolean
): string => {
  if (manualFetchInProgress) return 'Refreshing pull requests';
  if (cooldownActive || lastInteractionWasThrottled) return 'Refresh on cooldown';
  return 'Refresh pull requests';
};

export const deriveRefreshDisplay = (props: RefreshButtonProps): DerivedRefreshDisplay => {
  const { manualFetchInProgress, canRefresh, timeRemainingMs, lastInteractionWasThrottled } = props;
  const cooldownActive = !canRefresh && timeRemainingMs > 0;
  const refreshDisabled = manualFetchInProgress || !canRefresh;
  const secondsLeft = Math.ceil(timeRemainingMs / 1000);
  const phase = resolvePhase(
    manualFetchInProgress,
    lastInteractionWasThrottled,
    canRefresh,
    timeRemainingMs
  );
  const ringProgress01 = computeRingProgress01(props);
  const ringStrokeClass = computeRingStrokeClass(props);
  const tooltipLines = computeTooltipLines(props, cooldownActive, secondsLeft);
  const shortAriaLabel = computeShortAriaLabel(
    manualFetchInProgress,
    cooldownActive,
    lastInteractionWasThrottled
  );
  const showSeconds = manualFetchInProgress || cooldownActive || lastInteractionWasThrottled;

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
