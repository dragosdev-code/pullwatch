import { useCallback, useMemo, useState } from 'react';
import type { PullRequest } from '@common/types';

/**
 * Tracks PR ids that should no longer use the entrance animation for this popup open.
 * Resets when the popup closes. Updated when the user switches away from a list tab
 * (unmount) or opens a PR link.
 */
export const usePrEntranceViewedState = (assignedPRs: PullRequest[], mergedPRs: PullRequest[]) => {
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());

  const markViewedIds = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    setViewedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  const markViewedId = useCallback(
    (id: string) => {
      markViewedIds([id]);
    },
    [markViewedIds]
  );

  const assignedNewPrIds = useMemo(
    () =>
      new Set(assignedPRs.filter((pr) => pr.isNew && !viewedIds.has(pr.id)).map((pr) => pr.id)),
    [assignedPRs, viewedIds]
  );

  const mergedNewPrIds = useMemo(
    () => new Set(mergedPRs.filter((pr) => pr.isNew && !viewedIds.has(pr.id)).map((pr) => pr.id)),
    [mergedPRs, viewedIds]
  );

  return {
    assignedNewPrIds,
    mergedNewPrIds,
    markViewedIds,
    markViewedId,
  };
};
