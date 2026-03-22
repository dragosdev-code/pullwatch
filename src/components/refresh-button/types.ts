export type RefreshRingPhase = 'fetching' | 'throttled' | 'cooldown' | 'ready';

export interface RefreshButtonProps {
  manualFetchInProgress: boolean;
  onRefresh: () => void;
  fetchProgress01: number;
  fetchElapsedSeconds: number;
  cooldownProgress01: number;
  timeRemainingMs: number;
  canRefresh: boolean;
  lastInteractionWasThrottled: boolean;
  lastFetchDurationMs: number;
}

export interface DerivedRefreshDisplay {
  phase: RefreshRingPhase;
  ringProgress01: number;
  ringStrokeClass: string;
  tooltipLines: string[];
  shortAriaLabel: string;
  showSeconds: boolean;
  secondsLeft: number;
  refreshDisabled: boolean;
  cooldownActive: boolean;
}
