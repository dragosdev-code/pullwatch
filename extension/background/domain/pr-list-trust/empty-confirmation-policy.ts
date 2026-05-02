import type { GitHubStatusSnapshot } from '../../interfaces/IGitHubStatusClient';
import type { ListKind } from './types';

/**
 * Number of consecutive empty fetches required before persisting [] to storage
 * for the legitimate-zero path.
 *
 * WHY [per-list values]:
 * - assigned: review-requested transitions are infrequent; N=2 means at most
 *   one extra ~3 min poll before the popup shows empty. The assigned UX is
 *   the most-watched but a one-poll latency is invisible vs. CACHE_TTL_MS.
 * - authored: same justification; authored is rarely empty for active users.
 * - merged: N=3 because owner believes merged history is sticky, so the
 *   extra poll of safety costs little. Three polls = ~9 min, well within
 *   any "did my merged PR disappear?" support-ticket horizon.
 *
 * Cadence reference: `FETCH_INTERVAL_MINUTES = 3` in `extension/common/constants.ts`.
 */
export const EMPTY_CONFIRM_THRESHOLDS: Record<ListKind, number> = {
  assigned: 2,
  authored: 2,
  merged: 3,
};

/**
 * Statuspage states that count as "actively bad" — empty fetches in these
 * states corroborate an outage and bypass silent confirmation, routing
 * straight to the existing `signalGitHubOutage('pr_component_degraded')` path.
 *
 * WHY [stricter than `isProblematicPRStatus`]: `isProblematicPRStatus` returns
 * true for `degraded_performance` (used by the assessor to bump partial-drop
 * thresholds). For empty-corroboration we hold a tighter line:
 * `degraded_performance` does NOT corroborate a bare empty fetch as outage.
 * Statuspage frequently reports `degraded_performance` for issues unrelated
 * to PR search HTML.
 *
 * WHY [unknown handling]: `unknown` alone is fail-open (Statuspage timed out
 * or component name didn't match). It does NOT corroborate by itself; only
 * when paired with a non-none / non-unknown global indicator.
 */
export function isActivelyBadStatus(status: GitHubStatusSnapshot): boolean {
  if (status.prComponentStatus === 'partial_outage') return true;
  if (status.prComponentStatus === 'major_outage') return true;
  if (
    status.prComponentStatus === 'unknown' &&
    status.globalIndicator !== 'none' &&
    status.globalIndicator !== 'unknown'
  ) {
    return true;
  }
  return false;
}
