import type { PullRequest } from '@common/types';

export interface PullRequestListComparison {
  newPRs: PullRequest[];
  allPRsWithStatus: PullRequest[];
  removedPRs: PullRequest[];
}

export interface AssignedListMergeResult {
  allPRs: PullRequest[];
  filteredPending: PullRequest[];
  newPRs: PullRequest[];
  clientFilteredDraftKeys: string[];
}

export function filterPendingAssignedByDraftSetting(
  pendingPRs: PullRequest[],
  showDraftsInList: boolean
): PullRequest[] {
  return showDraftsInList ? pendingPRs : pendingPRs.filter((pr) => pr.type !== 'draft');
}

export function getPrKey(pr: PullRequest): string {
  return pr.id || pr.url;
}

export function getMissingPRs(oldPRs: PullRequest[], freshPRs: PullRequest[]): PullRequest[] {
  const freshKeys = new Set(freshPRs.map(getPrKey));
  return oldPRs.filter((pr) => !freshKeys.has(getPrKey(pr)));
}

export function comparePullRequestLists(
  oldPRs: PullRequest[],
  freshPRs: PullRequest[]
): PullRequestListComparison {
  const oldPRMap = new Map<string, PullRequest>();
  oldPRs.forEach((pr) => {
    oldPRMap.set(getPrKey(pr), pr);
  });

  const newPRs: PullRequest[] = [];
  const allPRsWithStatus: PullRequest[] = [];

  freshPRs.forEach((freshPR) => {
    const existingPR = oldPRMap.get(getPrKey(freshPR));
    const reviewStatus = freshPR.reviewStatus ?? 'pending';

    if (!existingPR) {
      const newPR = { ...freshPR, isNew: true, reviewStatus };
      newPRs.push(newPR);
      allPRsWithStatus.push(newPR);
      return;
    }

    allPRsWithStatus.push({ ...freshPR, isNew: false, reviewStatus });
  });

  return {
    newPRs,
    allPRsWithStatus,
    removedPRs: getMissingPRs(oldPRs, freshPRs),
  };
}

export function mergeAndFilterAssignedPRs(
  oldPendingPRs: PullRequest[],
  freshPendingRaw: PullRequest[],
  freshReviewedRaw: PullRequest[],
  showDrafts: boolean
): AssignedListMergeResult {
  const freshPending = freshPendingRaw.map((pr) => ({
    ...pr,
    reviewStatus: 'pending' as const,
  }));

  const { newPRs, allPRsWithStatus: pendingPRsWithStatus } = comparePullRequestLists(
    oldPendingPRs,
    freshPending
  );

  const pendingIds = new Set(pendingPRsWithStatus.map(getPrKey));
  const freshReviewed = freshReviewedRaw
    .filter((pr) => !pendingIds.has(getPrKey(pr)))
    .filter((pr) => pr.type !== 'merged')
    .map((pr): PullRequest => ({ ...pr, reviewStatus: 'reviewed' as const, isNew: false }));

  const filteredPending = filterPendingAssignedByDraftSetting(pendingPRsWithStatus, showDrafts);
  const filteredReviewed = showDrafts
    ? freshReviewed
    : freshReviewed.filter((pr) => pr.type !== 'draft');
  const clientFilteredDraftKeys = showDrafts
    ? []
    : [...pendingPRsWithStatus, ...freshReviewed].filter((pr) => pr.type === 'draft').map(getPrKey);

  return {
    allPRs: [...filteredPending, ...filteredReviewed],
    filteredPending,
    newPRs,
    clientFilteredDraftKeys,
  };
}
