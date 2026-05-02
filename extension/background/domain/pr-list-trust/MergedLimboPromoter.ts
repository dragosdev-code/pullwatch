import type { PullRequest } from '@common/types';
import { getMissingPRs, getPrKey } from '@background/utils/pull-request-list-utils';
import { sortPullRequestsByEventTime } from '@common/pull-request-timestamp';
import type { LimboEntry, ListKind } from './types';
import { PrListTrustStore } from './PrListTrustStore';

export class MergedLimboPromoter {
  constructor(private readonly trustStore: PrListTrustStore) {}

  async recordSuspiciousFetch(
    listKind: ListKind,
    reasons: string[],
    oldPRs: PullRequest[],
    freshPRs: PullRequest[]
  ): Promise<void> {
    const now = Date.now();
    const missingEntries = getMissingPRs(oldPRs, freshPRs);
    const state = await this.trustStore.read();
    const lists = { ...(state.lists ?? {}) };
    const current = lists[listKind] ?? {};
    const limboByKey = { ...(current.limboByKey ?? {}) };

    for (const pr of missingEntries) {
      const key = getPrKey(pr);
      const existing = limboByKey[key];
      limboByKey[key] = {
        pr: { ...pr, isNew: false },
        firstSeenAt: existing?.firstSeenAt ?? now,
        lastSeenAt: now,
        missCount: (existing?.missCount ?? 0) + 1,
      };
    }

    // WHY [reset empty-streak on suspicious]: a partial-drop or
    // corroborated-empty event invalidates any in-flight legitimate-zero
    // streak. Leaving `emptyConfirm` populated would let a later empty fetch
    // resume from a stale streak that was logically broken by this partial
    // drop, prematurely accepting [] without N fresh confirmations.
    const next = { ...current, limboByKey, lastSuspiciousAt: now, lastReasons: reasons };
    delete next.emptyConfirm;
    lists[listKind] = next;
    await this.trustStore.write({ ...state, lists });
  }

  async promoteTrustedMergedList(
    oldPRs: PullRequest[],
    freshPRs: PullRequest[],
    missConfirmationsRequired: number
  ): Promise<PullRequest[]> {
    const now = Date.now();
    const state = await this.trustStore.read();
    const lists = { ...(state.lists ?? {}) };
    const current = lists.merged ?? {};
    const limboByKey = { ...(current.limboByKey ?? {}) };
    const freshKeys = new Set(freshPRs.map(getPrKey));
    const promoted = [...freshPRs];

    for (const pr of oldPRs) {
      const key = getPrKey(pr);
      if (freshKeys.has(key)) {
        delete limboByKey[key];
        continue;
      }

      const existing = limboByKey[key];
      const next: LimboEntry = {
        pr: { ...pr, isNew: false },
        firstSeenAt: existing?.firstSeenAt ?? now,
        lastSeenAt: now,
        missCount: (existing?.missCount ?? 0) + 1,
      };

      if (next.missCount < missConfirmationsRequired) {
        limboByKey[key] = next;
        promoted.push(next.pr);
      } else {
        delete limboByKey[key];
      }
    }

    // WHY [reset empty-streak on trusted]: same rationale as `recordTrustedFetch` —
    // a successful trusted merged fetch invalidates any in-flight `emptyConfirm`
    // bucket so future empty fetches can not resume from stale streak state.
    const next = {
      ...current,
      limboByKey,
      lastTrustedAt: now,
      lastTrustedCount: promoted.length,
      lastReasons: [],
    };
    delete next.emptyConfirm;
    lists.merged = next;
    await this.trustStore.write({ ...state, lists });

    return sortPullRequestsByEventTime(promoted);
  }

  async recordTrustedFetch(listKind: ListKind, count: number): Promise<void> {
    const state = await this.trustStore.read();
    const lists = { ...(state.lists ?? {}) };
    const current = lists[listKind] ?? {};
    // WHY [reset empty-streak on trusted]: a successful trusted fetch is the
    // canonical "list is healthy now" signal. Any in-flight `emptyConfirm`
    // streak from prior empty polls must drop here so a future empty does
    // not resume from stale state.
    const next = {
      ...current,
      lastTrustedAt: Date.now(),
      lastTrustedCount: count,
      lastReasons: [],
    };
    delete next.emptyConfirm;
    lists[listKind] = next;
    await this.trustStore.write({ ...state, lists });
  }
}
