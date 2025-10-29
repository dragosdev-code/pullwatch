import type { PullRequest } from '../../extension/common/types';
import { PRItem } from './PRItem';

interface PRListProps {
  prs: PullRequest[];
  newPrIds: Set<string>;
  hasEverLoaded?: boolean;
}

export const PRList = ({ prs, newPrIds, hasEverLoaded = false }: PRListProps) => {
  if (prs.length === 0) {
    return (
      <div className="h-[360px] overflow-y-auto">
        <div className="flex items-center justify-center py-20">
          {hasEverLoaded ? (
            <p className="text-gray-500 text-sm italic">No PRs assigned to you for review</p>
          ) : (
            <div className="text-center">
              <p className="text-gray-500 text-sm italic mb-2">
                Click the refresh button to load your PRs
              </p>
              <div className="text-gray-400 text-xs">
                PRs requesting your review will appear here
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const pendingPRs = prs.filter((pr) => pr.reviewStatus !== 'reviewed');
  const reviewedPRs = prs.filter((pr) => pr.reviewStatus === 'reviewed');

  return (
    <div className="h-[360px] overflow-y-auto">
      {pendingPRs.length > 0 && (
        <div className="space-y-0">
          {pendingPRs.map((pr) => (
            <PRItem key={pr.id} pr={pr} isNew={newPrIds.has(pr.id)} isReviewed={false} />
          ))}
        </div>
      )}

      {reviewedPRs.length > 0 && (
        <div className="space-y-0">
          {reviewedPRs.map((pr) => (
            <PRItem key={pr.id} pr={pr} isNew={false} isReviewed />
          ))}
        </div>
      )}
    </div>
  );
};
