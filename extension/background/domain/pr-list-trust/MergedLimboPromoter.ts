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

    lists[listKind] = {
      ...current,
      limboByKey,
      lastSuspiciousAt: now,
      lastReasons: reasons,
    };
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

    lists.merged = {
      ...current,
      limboByKey,
      lastTrustedAt: now,
      lastTrustedCount: promoted.length,
      lastReasons: [],
    };
    await this.trustStore.write({ ...state, lists });

    return sortPullRequestsByEventTime(promoted);
  }

  async recordTrustedFetch(listKind: ListKind, count: number): Promise<void> {
    const state = await this.trustStore.read();
    const lists = { ...(state.lists ?? {}) };
    const current = lists[listKind] ?? {};
    lists[listKind] = {
      ...current,
      lastTrustedAt: Date.now(),
      lastTrustedCount: count,
      lastReasons: [],
    };
    await this.trustStore.write({ ...state, lists });
  }
}
