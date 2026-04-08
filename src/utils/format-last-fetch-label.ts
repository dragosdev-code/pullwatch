import { differenceInSeconds } from 'date-fns';

/**
 * Copy and thresholds for the header “last updated” line + tooltip.
 * WHY centralised: one place for the 60s boundary and minute wording used in tests and UI.
 */
export const LAST_FETCH_PREFIX = 'Updated ' as const;

export type LastFetchMainLine =
  | { variant: 'plain'; text: string }
  | {
      variant: 'withSuffix';
      prefix: typeof LAST_FETCH_PREFIX;
      suffix: string;
      /** True when the suffix is the minute form; UI shows min+sec detail in a tooltip only then. */
      detailTooltip: boolean;
    };

/**
 * Whole seconds from last fetch to `now`, floored and non-negative.
 * WHY date-fns: calendar-safe deltas and one canonical definition of “seconds between” vs hand-rolled ms/1000.
 */
export function elapsedWholeSeconds(lastFetchMs: number, nowMs: number): number {
  return Math.max(0, differenceInSeconds(new Date(nowMs), new Date(lastFetchMs)));
}

/**
 * Visible main line: either a single message (no hover target) or `Updated ` + age suffix.
 */
export function formatLastFetchMainLine(
  lastFetchMs: number | null,
  nowMs: number
): LastFetchMainLine {
  if (lastFetchMs === null) {
    return { variant: 'plain', text: 'No updates yet' };
  }
  const totalSec = elapsedWholeSeconds(lastFetchMs, nowMs);
  if (totalSec < 60) {
    return {
      variant: 'withSuffix',
      prefix: LAST_FETCH_PREFIX,
      suffix: `${totalSec}s ago`,
      detailTooltip: false,
    };
  }
  const mins = Math.floor(totalSec / 60);
  return {
    variant: 'withSuffix',
    prefix: LAST_FETCH_PREFIX,
    suffix: `${mins} min ago`,
    detailTooltip: true,
  };
}

/**
 * Richer age string for tooltip + screen-reader description; updates every second while shown.
 */
export function formatLastFetchDetail(lastFetchMs: number, nowMs: number): string {
  const totalSec = elapsedWholeSeconds(lastFetchMs, nowMs);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m} min ${s} sec ago`;
}
