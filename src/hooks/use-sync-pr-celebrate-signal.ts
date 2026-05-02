import { useEffect, useRef } from 'react';
import type { PullRequest } from '@common/types';
import { newPrIdsKey, shouldCelebrateNewPrIds } from '@src/hooks/pr-celebrate-delta';
import { usePrCelebrateSignalStore } from '@src/stores/pr-celebrate-signal';

/**
 * Single subscription point: compares assigned + merged snapshots and bumps the global celebrate
 * signal when a new `isNew` id appears. Mount once in {@link AppShell} with the same arrays already
 * read from React Query there—keeps Header, settings overlay, and any future consumers in sync.
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
export const useSyncPrCelebrateSignal = (
  assignedPRs: PullRequest[],
  mergedPRs: PullRequest[]
): void => {
  const prevKeyRef = useRef<string | null>(null);
  const bump = usePrCelebrateSignalStore((s) => s.bump);

  useEffect(() => {
    const key = newPrIdsKey(assignedPRs, mergedPRs);

    if (prevKeyRef.current === null) {
      prevKeyRef.current = key;
      return;
    }

    if (prevKeyRef.current === key) {
      return;
    }

    if (shouldCelebrateNewPrIds(prevKeyRef.current, key)) {
      bump();
    }

    prevKeyRef.current = key;
  }, [assignedPRs, mergedPRs, bump]);
};
