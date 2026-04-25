import { useEffect, useRef, useState } from 'react';
import type { PullRequest } from '@common/types';

/**
 * Stable sorted key for the set of PR ids that the background marked `isNew` after a compare.
 * We use `\0` as a delimiter because PR urls can contain commas.
 */
const newPrIdsKey = (assigned: PullRequest[], merged: PullRequest[]): string => {
  const ids = new Set<string>();
  for (const pr of assigned) {
    if (pr.isNew) {
      ids.add(pr.id || pr.url);
    }
  }
  for (const pr of merged) {
    if (pr.isNew) {
      ids.add(pr.id || pr.url);
    }
  }
  return [...ids].sort().join('\0');
};

/**
 * Bumps `celebrateSignal` when assigned or merged lists gain at least one **new** `isNew` id
 * compared to the previous React snapshot—e.g. alarm write → storage sync, background broadcast,
 * or manual refresh while the popup stays open.
 *
 * **Why baseline the first snapshot without firing:** cold opens hydrate from storage that may
 * already carry `isNew` from an earlier wake or notification; replaying the wordmark every time
 * would feel like noise. We only celebrate a **delta** the user can attribute to “something just
 * landed.”
 *
 * **Why compare raw `isNew` (not list “viewed” state):** `usePrEntranceViewedState` is UI-only;
 * cache rows still carry `isNew` until the next fetch merges, so we do not re-fire when the user
 * merely scrolls or marks rows seen.
 *
 * **Why omit authored:** this codebase only marks entrance/`isNew` for assigned and merged flows.
 */
export const useNamedLogoCelebrateOnNewPr = (
  assignedPRs: PullRequest[],
  mergedPRs: PullRequest[]
): number => {
  const prevKeyRef = useRef<string | null>(null);
  const [celebrateSignal, setCelebrateSignal] = useState(0);

  useEffect(() => {
    const key = newPrIdsKey(assignedPRs, mergedPRs);

    if (prevKeyRef.current === null) {
      prevKeyRef.current = key;
      return;
    }

    if (prevKeyRef.current === key) {
      return;
    }

    const prevSet = new Set(
      prevKeyRef.current.length > 0 ? prevKeyRef.current.split('\0') : []
    );
    const currSet = new Set(key.length > 0 ? key.split('\0') : []);

    let hasNewId = false;
    for (const id of currSet) {
      if (!prevSet.has(id)) {
        hasNewId = true;
        break;
      }
    }

    if (hasNewId) {
      setCelebrateSignal((n) => n + 1);
    }

    prevKeyRef.current = key;
  }, [assignedPRs, mergedPRs]);

  return celebrateSignal;
};
