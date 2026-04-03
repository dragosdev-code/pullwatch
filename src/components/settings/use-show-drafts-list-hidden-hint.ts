import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { PullRequest } from '../../../extension/common/types';
import { assignedPrsQueryOptions } from '../../hooks/use-assigned-prs';

/** Mirrors background list filtering: a row is a draft when `type === 'draft'`. */
export const hasDraftPRsInAssignedCache = (prs: PullRequest[]): boolean =>
  prs.some((pr) => pr.type === 'draft');

/**
 * Info hint: after the user turns **Show drafts in list** off, explain that cached draft rows
 * linger until the next sync/refresh. Only meaningful when the assigned cache still contains drafts.
 *
 * WHY React Query `select`: subscribe to `assignedPrs` without re-rendering on unrelated list edits
 * once `hasDraftPRsInList` stays the same boolean.
 *
 * WHY `armed` + prev ref: the hint must not appear on initial load when the setting was already off;
 * only after a true → false transition (same pattern as `useAssignedDraftNotifyListSync`).
 */
export const useShowDraftsListHiddenHint = (showDraftsInList: boolean): { hintVisible: boolean } => {
  const { data: hasDraftPRsInCache } = useQuery({
    ...assignedPrsQueryOptions,
    select: (prs: PullRequest[]) => hasDraftPRsInAssignedCache(prs),
  });

  const [armed, setArmed] = useState(false);
  const prevShowDraftsInListRef = useRef<boolean | null>(null);

  useEffect(() => {
    const prev = prevShowDraftsInListRef.current;
    prevShowDraftsInListRef.current = showDraftsInList;
    // WHY null: first run only seeds the ref — no "user just toggled" narrative on mount/hydration.
    if (prev === null) {
      return;
    }
    if (prev && !showDraftsInList) {
      setArmed(true);
    }
    if (showDraftsInList) {
      setArmed(false);
    }
  }, [showDraftsInList]);

  useEffect(() => {
    // WHY: once storage/refresh drops drafts, end the hint session so a later OFF toggle starts clean.
    if (hasDraftPRsInCache === false) {
      setArmed(false);
    }
  }, [hasDraftPRsInCache]);

  const hintVisible =
    !showDraftsInList && armed && hasDraftPRsInCache === true;

  return { hintVisible };
};
