import type { GitHubStatusSnapshot } from '../../interfaces/IGitHubStatusClient';
import type { PullRequest } from '@common/types';

export type ListKind = 'assigned' | 'merged' | 'authored';

export interface LimboEntry {
  pr: PullRequest;
  firstSeenAt: number;
  lastSeenAt: number;
  missCount: number;
}

/**
 * Tracks consecutive empty fetches after a non-empty trusted state.
 *
 * WHY [silent confirmation]: An empty PR list with a green Statuspage is the
 * legitimate "I finished my work" steady state. We only persist [] after N
 * confirmations with stable viewer identity, so a one-tick flake never wipes
 * the user's stored list and the global outage banner is never raised for a
 * legitimate zero. Existing partial-drop suspicion remains in `lastReasons`
 * and continues to flow through `MergedLimboPromoter` / the corroborated
 * outage path.
 *
 * WHY [identity pin]: Account swap mid-streak invalidates the streak — the
 * fresh empty list belongs to a different viewer and is handled by the
 * account-swap branch in `PRService.detectAccountSwap`, which clears this
 * bucket via `EmptyConfirmationTracker.clear()`. The tracker also defensively
 * resets if it observes an `identityAtStart` mismatch.
 */
export interface EmptyConfirmationBucket {
  streak: number;
  startedAt: number;
  identityAtStart: string | null;
  prComponentStatusAtStart: GitHubStatusSnapshot['prComponentStatus'];
  lastEmptyAt: number;
  prevTrustedCount: number;
}

/**
 * Discriminator consumed once by the next trusted non-empty fetch in the
 * trusted branch. Tells `PRService` to mark fresh as baseline (via
 * `markAsExistingBaseline`, the same helper used on account swap) instead of
 * running `comparePullRequestLists`, so a recovery from `accepted_empty` does
 * not fan out a "all PRs are new" notification storm.
 *
 * WHY [dedicated field]: `lastReasons` holds free-form assessor reason
 * strings; recycling it for control flow blurs semantics. A dedicated typed
 * field keeps the contract explicit and grep-able.
 */
export type RecoveryBaselineReason = 'accepted_empty';

export interface ListTrustBucket {
  limboByKey?: Record<string, LimboEntry>;
  lastTrustedAt?: number;
  lastTrustedCount?: number;
  lastSuspiciousAt?: number;
  lastReasons?: string[];
  /**
   * Present only while the list is in EmptyPending. Cleared on Trusted (a
   * non-empty trusted fetch), AcceptedEmpty (streak reaches threshold),
   * EmptyCorroborated (Statuspage flips actively bad mid-streak), or account
   * swap.
   */
  emptyConfirm?: EmptyConfirmationBucket;
  /**
   * One-shot recovery hint set by the AcceptedEmpty transition; consumed by
   * the next trusted non-empty fetch in `PRService` and cleared in the same
   * step.
   */
  recoveryBaseline?: RecoveryBaselineReason;
}

export interface PRListTrustState {
  lists?: Partial<Record<ListKind, ListTrustBucket>>;
}

/**
 * Discriminator on `ListTrustAssessment` consumed by the dispatcher in
 * `PRService`. Replaces brittle string-matching on `reasons[]` for control
 * flow. `suspicious` is retained as a backward-compatible signal for tests
 * and logging.
 *
 * - `trusted`: assessor saw no anomaly (or `oldPRs.length === 0` short-circuit).
 * - `suspect_partial`: any `partial_drop_*` reason fired (status-gated drop).
 * - `suspect_empty`: only `empty_after_non_empty` fired; the dispatcher hands
 *   this off to `EmptyConfirmationTracker.observeEmpty` for the silent
 *   confirmation state machine.
 *
 * If both an empty and a partial-drop reason fire on the same assessment
 * (extreme edge case — empty fresh implies all old missing, but the
 * partial-drop branches require a non-empty fresh so this should not
 * happen in practice), `suspect_partial` takes precedence so we route
 * through the existing limbo + corroborated outage path.
 */
export type ListTrustKind = 'trusted' | 'suspect_partial' | 'suspect_empty';

export interface ListTrustAssessment {
  suspicious: boolean;
  reasons: string[];
  status: GitHubStatusSnapshot;
  missConfirmationsRequired: number;
  kind: ListTrustKind;
}
