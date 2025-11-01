import type { PullRequest } from '../../extension/common/types';
import { PRItem } from './PRItem';

interface PRListProps {
  prs: PullRequest[];
  newPrIds: Set<string>;
  hasEverLoaded?: boolean;
  isAuthoredTab?: boolean;
}

export const PRList = ({
  prs,
  newPrIds,
  hasEverLoaded = false,
  isAuthoredTab = false,
}: PRListProps) => {
  if (prs.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        {hasEverLoaded ? (
          <p className="text-gray-500 text-sm italic">
            {isAuthoredTab ? 'No PRs authored by you' : 'No PRs assigned to you for review'}
          </p>
        ) : (
          <div className="text-center">
            <p className="text-gray-500 text-sm italic mb-2">
              Click the refresh button to load your PRs
            </p>
            <div className="text-gray-400 text-xs">
              {isAuthoredTab
                ? 'PRs you authored will appear here'
                : 'PRs requesting your review will appear here'}
            </div>
          </div>
        )}
      </div>
    );
  }

  // If this is the authored tab, group by authorReviewStatus
  if (isAuthoredTab) {
    const changesRequestedPRs = prs.filter((pr) => pr.authorReviewStatus === 'changes_requested');
    const approvedPRs = prs.filter((pr) => pr.authorReviewStatus === 'approved');
    const pendingPRs = prs.filter((pr) => pr.authorReviewStatus === 'pending');
    const commentedPRs = prs.filter((pr) => pr.authorReviewStatus === 'commented');
    const draftPRs = prs.filter((pr) => pr.authorReviewStatus === 'draft');

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
  }

  return (
    <div className="h-full overflow-y-auto">
      {prs.length > 0 && (
        <>
          {prs.map((pr) => (
            <PRItem key={pr.id} pr={pr} isNew={newPrIds.has(pr.id)} isReviewed={false} />
          ))}
        </>
      )}
    </div>
  );
};
