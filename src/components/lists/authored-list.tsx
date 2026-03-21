import type { PullRequest } from '../../../extension/common/types';
import { PRItem } from '../pr-item';
import { PRListEmptyState } from './pr-list-empty-state';

interface AuthoredListProps {
  prs: PullRequest[];
  hasEverLoaded: boolean;
}

export const AuthoredList = ({ prs, hasEverLoaded }: AuthoredListProps) => {
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
            <PRItem
              key={pr.id}
              pr={pr}
              isNew={false}
              isFirst={firstGroupIndex === 0 && i === 0}
              showAuthorStatus
            />
          ))}
        </>
      )}

      {approvedPRs.length > 0 && (
        <>
          {approvedPRs.map((pr, i) => (
            <PRItem
              key={pr.id}
              pr={pr}
              isNew={false}
              isFirst={firstGroupIndex === 1 && i === 0}
              showAuthorStatus
            />
          ))}
        </>
      )}

      {pendingPRs.length > 0 && (
        <>
          {pendingPRs.map((pr, i) => (
            <PRItem
              key={pr.id}
              pr={pr}
              isNew={false}
              isFirst={firstGroupIndex === 2 && i === 0}
              showAuthorStatus
            />
          ))}
        </>
      )}

      {commentedPRs.length > 0 && (
        <div className="space-y-0">
          {commentedPRs.map((pr, i) => (
            <PRItem
              key={pr.id}
              pr={pr}
              isNew={false}
              isFirst={firstGroupIndex === 3 && i === 0}
              showAuthorStatus
            />
          ))}
        </div>
      )}

      {draftPRs.length > 0 && (
        <div className="space-y-0">
          {draftPRs.map((pr, i) => (
            <PRItem
              key={pr.id}
              pr={pr}
              isNew={false}
              isFirst={firstGroupIndex === 4 && i === 0}
              showAuthorStatus
            />
          ))}
        </div>
      )}
    </div>
  );
};
