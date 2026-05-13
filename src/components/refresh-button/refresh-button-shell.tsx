import { useMemo } from 'react';
import { RefreshGlyph } from './components/refresh-glyph';
import { RefreshTooltipFrame } from './components/refresh-tooltip-frame';
import type { RefreshButtonProps } from './types';
import { useDelayedTooltip } from './hooks/use-delayed-tooltip';
import { deriveRefreshDisplay } from './utils/derive-refresh-display';

export function RefreshButtonShell({
  manualFetchInProgress,
  backgroundFetchInProgress,
  onRefresh,
  fetchProgress01,
  fetchElapsedSeconds,
  cooldownProgress01,
  timeRemainingMs,
  canRefresh,
  lastInteractionWasThrottled,
  lastFetchDurationMs,
}: RefreshButtonProps) {
  const derived = useMemo(
    () =>
      deriveRefreshDisplay({
        manualFetchInProgress,
        backgroundFetchInProgress,
        onRefresh,
        fetchProgress01,
        fetchElapsedSeconds,
        cooldownProgress01,
        timeRemainingMs,
        canRefresh,
        lastInteractionWasThrottled,
        lastFetchDurationMs,
      }),
    [
      manualFetchInProgress,
      backgroundFetchInProgress,
      onRefresh,
      fetchProgress01,
      fetchElapsedSeconds,
      cooldownProgress01,
      timeRemainingMs,
      canRefresh,
      lastInteractionWasThrottled,
      lastFetchDurationMs,
    ]
  );

  const {
    containerRef,
    tooltipOpen,
    policyId,
    scheduleTooltipOpen,
    closeTooltipImmediately,
    handleContainerBlur,
  } = useDelayedTooltip();

  return (
    <RefreshTooltipFrame
      containerRef={containerRef}
      tooltipOpen={tooltipOpen}
      policyId={policyId}
      refreshDisabled={derived.refreshDisabled}
      shortAriaLabel={derived.shortAriaLabel}
      tooltipLines={derived.tooltipLines}
      onMouseEnter={scheduleTooltipOpen}
      onMouseLeave={closeTooltipImmediately}
      onHostFocus={derived.refreshDisabled ? scheduleTooltipOpen : undefined}
      onHostBlur={derived.refreshDisabled ? handleContainerBlur : undefined}
    >
      <RefreshGlyph
        phase={derived.phase}
        ringProgress01={derived.ringProgress01}
        ringStrokeClass={derived.ringStrokeClass}
        manualFetchInProgress={manualFetchInProgress}
        canRefresh={canRefresh}
        refreshDisabled={derived.refreshDisabled}
        shortAriaLabel={derived.shortAriaLabel}
        policyId={policyId}
        showSeconds={derived.showSeconds}
        secondsLeft={derived.secondsLeft}
        fetchElapsedSeconds={fetchElapsedSeconds}
        cooldownActive={derived.cooldownActive}
        lastInteractionWasThrottled={lastInteractionWasThrottled}
        onRefresh={onRefresh}
        scheduleTooltipOpen={scheduleTooltipOpen}
        handleContainerBlur={handleContainerBlur}
      />
    </RefreshTooltipFrame>
  );
}
