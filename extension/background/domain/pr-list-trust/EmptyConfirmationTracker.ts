import type { GitHubStatusSnapshot } from '../../interfaces/IGitHubStatusClient';
import type { IDebugService } from '../../interfaces/IDebugService';
import type { EmptyConfirmationBucket, ListKind } from './types';
import { PrListTrustStore } from './PrListTrustStore';
import { EMPTY_CONFIRM_THRESHOLDS, isActivelyBadStatus } from './empty-confirmation-policy';

export type EmptyOutcome =
  | { kind: 'pending'; streak: number; threshold: number }
  | { kind: 'accept'; streak: number; threshold: number }
  | { kind: 'corroborated'; streak: number }
  | { kind: 'reset_swap' };

/**
 * Owns the silent confirmation streak for the empty-transition branch of
 * `PrListTrustAssessor`. State lives in `ListTrustBucket.emptyConfirm` so a
 * service-worker restart re-reads the streak from `chrome.storage.local`.
 *
 * Integration points:
 * - `PRService` dispatcher calls `observeEmpty()` when the assessment kind is
 *   `'suspect_empty'` and `accountSwap` is false.
 * - On `'accept'`, `PRService` persists `[]`, sets `recoveryBaseline = 'accepted_empty'`
 *   on the same bucket, and clears the global outage flag if it was set.
 * - On `'pending'`, `PRService` returns `oldPRs` WITHOUT touching
 *   `healthStatusService` or writing `STORAGE_KEY_LAST_UNTRUSTED_FETCH_AT`.
 * - On `'corroborated'`, `PRService` routes to the existing
 *   `signalGitHubOutage('pr_component_degraded')` + limbo path.
 * - On `'reset_swap'`, `PRService` treats fresh as a new baseline (parallel
 *   to `detectAccountSwap`); identity mismatch is not an outage.
 * - `clear()` is invoked from `PRService` on the trusted (non-empty) path
 *   and on the account-swap branch.
 */
export class EmptyConfirmationTracker {
  constructor(
    private readonly trustStore: PrListTrustStore,
    private readonly debug: IDebugService
  ) {}

  async observeEmpty(args: {
    listKind: ListKind;
    oldCount: number;
    currentLogin: string | null;
    status: GitHubStatusSnapshot;
  }): Promise<EmptyOutcome> {
    const { listKind, oldCount, currentLogin, status } = args;
    const threshold = EMPTY_CONFIRM_THRESHOLDS[listKind];
    const now = Date.now();

    if (isActivelyBadStatus(status)) {
      // WHY [drop streak on corroborate]: once Statuspage corroborates, ownership
      // of this fetch moves to the existing outage path. Leaving a stale streak
      // would race with recovery (next non-empty fetch must take the trusted
      // branch cleanly without consuming an empty-streak state machine).
      await this.clear(listKind);
      return { kind: 'corroborated', streak: 0 };
    }

    const state = await this.trustStore.read();
    const lists = { ...(state.lists ?? {}) };
    const current = lists[listKind] ?? {};
    const prior = current.emptyConfirm;

    if (prior && prior.identityAtStart && currentLogin && prior.identityAtStart !== currentLogin) {
      // WHY [defensive identity reset]: `PRService.detectAccountSwap` is the
      // primary swap pre-empt and clears the bucket explicitly. This branch
      // protects against any path where the swap pre-empt missed (e.g. a
      // wave-depth race where the cycle baseline lagged). Identity mismatch
      // is NOT an outage — it indicates a viewer change, so the empty fetch
      // belongs to the new viewer's baseline.
      const cleared = { ...current };
      delete cleared.emptyConfirm;
      lists[listKind] = cleared;
      await this.trustStore.write({ ...state, lists });
      this.debug.log(
        `[EmptyConfirmationTracker] ${listKind} streak reset — identity ${prior.identityAtStart} -> ${currentLogin}`
      );
      return { kind: 'reset_swap' };
    }

    const nextStreak = (prior?.streak ?? 0) + 1;
    const next: EmptyConfirmationBucket = {
      streak: nextStreak,
      startedAt: prior?.startedAt ?? now,
      // WHY [null-tolerant pin]: `currentLogin === null` is a transient session
      // blip, not a viewer change. Carry forward `prior.identityAtStart` so a
      // brief null does not invalidate the streak. The mismatch branch above
      // requires both sides to be non-null before declaring a swap — same
      // policy as `PRService.detectAccountSwap`.
      identityAtStart: prior?.identityAtStart ?? currentLogin,
      prComponentStatusAtStart: prior?.prComponentStatusAtStart ?? status.prComponentStatus,
      lastEmptyAt: now,
      prevTrustedCount: prior?.prevTrustedCount ?? oldCount,
    };

    if (nextStreak >= threshold) {
      const cleared = { ...current };
      delete cleared.emptyConfirm;
      lists[listKind] = cleared;
      await this.trustStore.write({ ...state, lists });
      return { kind: 'accept', streak: nextStreak, threshold };
    }

    lists[listKind] = { ...current, emptyConfirm: next };
    await this.trustStore.write({ ...state, lists });
    return { kind: 'pending', streak: nextStreak, threshold };
  }

  async clear(listKind: ListKind): Promise<void> {
    const state = await this.trustStore.read();
    const lists = { ...(state.lists ?? {}) };
    const current = lists[listKind];
    if (!current?.emptyConfirm) return;
    const cleared = { ...current };
    delete cleared.emptyConfirm;
    lists[listKind] = cleared;
    await this.trustStore.write({ ...state, lists });
  }
}
