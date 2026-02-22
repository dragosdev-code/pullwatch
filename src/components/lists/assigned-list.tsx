import { useEffect } from 'react';
import type { PullRequest } from '../../../extension/common/types';
import { PRItem } from '../pr-item';
import { PRListEmptyState } from './pr-list-empty-state';

interface AssignedListProps {
  prs: PullRequest[];
  newPrIds: Set<string>;
  hasEverLoaded: boolean;
  onViewIds: (ids: string[]) => void;
}

export const AssignedList = ({ prs, newPrIds, hasEverLoaded, onViewIds }: AssignedListProps) => {
  // Mark new PRs as viewed when this component unmounts (user switches tabs)
  useEffect(() => {
    return () => {
      const idsToMark = prs.filter((pr) => newPrIds.has(pr.id)).map((pr) => pr.id);
      if (idsToMark.length > 0) onViewIds(idsToMark);
    };
  }, [prs, newPrIds, onViewIds]);

  const pendingPRs = prs.filter((pr) => pr.reviewStatus === 'pending');
  const reviewedPRs = prs.filter((pr) => pr.reviewStatus === 'reviewed');

  if (prs.length === 0) {
    return (
      <PRListEmptyState
        message="No PRs assigned to you for review"
        subMessage="PRs requesting your review will appear here"
        hasEverLoaded={hasEverLoaded}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      {pendingPRs.length > 0 && (
        <>
          {pendingPRs.map((pr, i) => (
            <PRItem
              key={pr.id}
              pr={pr}
              isNew={newPrIds.has(pr.id)}
              isFirst={i === 0}
              isReviewed={pr.reviewStatus === 'reviewed'}
            />
          ))}
        </>
      )}
      {reviewedPRs.length > 0 && (
        <>
          {reviewedPRs.map((pr, i) => (
            <PRItem
              key={pr.id}
              pr={pr}
              isNew={newPrIds.has(pr.id)}
              isFirst={pendingPRs.length === 0 && i === 0}
              isReviewed={pr.reviewStatus === 'reviewed'}
            />
          ))}
        </>
      )}
    </div>
  );
};
