import { useEffect } from 'react';
import type { PullRequest } from '../../../extension/common/types';
import { PRItem } from '../PRItem';
import { PRListEmptyState } from './PRListEmptyState';

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

  return (
    <div className="h-full overflow-y-auto">
      {changesRequestedPRs.length > 0 && (
        <>
          {changesRequestedPRs.map((pr) => (
            <PRItem key={pr.id} pr={pr} isNew={newPrIds.has(pr.id)} showAuthorStatus />
          ))}
        </>
      )}

      {approvedPRs.length > 0 && (
        <>
          {approvedPRs.map((pr) => (
            <PRItem key={pr.id} pr={pr} isNew={newPrIds.has(pr.id)} showAuthorStatus />
          ))}
        </>
      )}

      {pendingPRs.length > 0 && (
        <>
          {pendingPRs.map((pr) => (
            <PRItem key={pr.id} pr={pr} isNew={newPrIds.has(pr.id)} showAuthorStatus />
          ))}
        </>
      )}

      {commentedPRs.length > 0 && (
        <div className="space-y-0">
          {commentedPRs.map((pr) => (
            <PRItem key={pr.id} pr={pr} isNew={newPrIds.has(pr.id)} showAuthorStatus />
          ))}
        </div>
      )}

      {draftPRs.length > 0 && (
        <div className="space-y-0">
          {draftPRs.map((pr) => (
            <PRItem key={pr.id} pr={pr} isNew={newPrIds.has(pr.id)} showAuthorStatus />
          ))}
        </div>
      )}
    </div>
  );
};
