export type RefreshRingPhase = 'fetching' | 'background' | 'throttled' | 'cooldown' | 'ready';

export interface RefreshButtonProps {
  manualFetchInProgress: boolean;
  /** Alarm-driven fetch in progress. Disables the button without showing the manual fetch ring. */
  backgroundFetchInProgress: boolean;
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
