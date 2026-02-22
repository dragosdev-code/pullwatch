import { useEffect } from 'react';
import type { PullRequest } from '../../../extension/common/types';
import { PRItem } from '../pr-item';
import { PRListEmptyState } from './pr-list-empty-state';

interface AuthoredListProps {
  prs: PullRequest[];
  newPrIds: Set<string>;
  hasEverLoaded: boolean;
  onViewIds: (ids: string[]) => void;
}

export const AuthoredList = ({ prs, newPrIds, hasEverLoaded, onViewIds }: AuthoredListProps) => {
  // Mark new PRs as viewed when this component unmounts (user switches tabs)
  useEffect(() => {
    return () => {
      const idsToMark = prs.filter((pr) => newPrIds.has(pr.id)).map((pr) => pr.id);
      if (idsToMark.length > 0) onViewIds(idsToMark);
    };
  }, [prs, newPrIds, onViewIds]);

  const changesRequestedPRs = prs.filter((pr) => pr.authorReviewStatus === 'changes_requested');
  const approvedPRs = prs.filter((pr) => pr.authorReviewStatus === 'approved');
  const pendingPRs = prs.filter((pr) => pr.authorReviewStatus === 'pending');
  const commentedPRs = prs.filter((pr) => pr.authorReviewStatus === 'commented');
  const draftPRs = prs.filter((pr) => pr.authorReviewStatus === 'draft');

  if (prs.length === 0) {
    return (
      <PRListEmptyState
        message="No PRs authored by you"
        subMessage="PRs you authored will appear here"
        hasEverLoaded={hasEverLoaded}
      />
    );
  }

  const orderedGroups = [changesRequestedPRs, approvedPRs, pendingPRs, commentedPRs, draftPRs];
  const firstGroupIndex = orderedGroups.findIndex((g) => g.length > 0);

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      {changesRequestedPRs.length > 0 && (
        <>
          {changesRequestedPRs.map((pr, i) => (
            <PRItem key={pr.id} pr={pr} isNew={newPrIds.has(pr.id)} isFirst={firstGroupIndex === 0 && i === 0} showAuthorStatus />
          ))}
        </>
      )}

      {approvedPRs.length > 0 && (
        <>
          {approvedPRs.map((pr, i) => (
            <PRItem key={pr.id} pr={pr} isNew={newPrIds.has(pr.id)} isFirst={firstGroupIndex === 1 && i === 0} showAuthorStatus />
          ))}
        </>
      )}

      {pendingPRs.length > 0 && (
        <>
          {pendingPRs.map((pr, i) => (
            <PRItem key={pr.id} pr={pr} isNew={newPrIds.has(pr.id)} isFirst={firstGroupIndex === 2 && i === 0} showAuthorStatus />
          ))}
        </>
      )}

      {commentedPRs.length > 0 && (
        <div className="space-y-0">
          {commentedPRs.map((pr, i) => (
            <PRItem key={pr.id} pr={pr} isNew={newPrIds.has(pr.id)} isFirst={firstGroupIndex === 3 && i === 0} showAuthorStatus />
          ))}
        </div>
      )}

      {draftPRs.length > 0 && (
        <div className="space-y-0">
          {draftPRs.map((pr, i) => (
            <PRItem key={pr.id} pr={pr} isNew={newPrIds.has(pr.id)} isFirst={firstGroupIndex === 4 && i === 0} showAuthorStatus />
          ))}
        </div>
      )}
    </div>
  );
};
