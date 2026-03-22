import type { PullRequest } from '../../../extension/common/types';
import { CheckIcon } from '../ui/icons';
import { PRStatusIcon } from '../ui/pr-status-icon';
import { StatusBadge } from '../ui/status-badge';
import { PrItemTruncatedTitle } from './pr-item-truncated-title';

interface PrItemHeaderRowProps {
  prType: PullRequest['type'];
  title: string;
  isFirst: boolean;
  isReviewed: boolean;
  showAuthorStatus: boolean;
  authorReviewStatus: PullRequest['authorReviewStatus'];
}

export const PrItemHeaderRow = ({
  prType,
  title,
  isFirst,
  isReviewed,
  showAuthorStatus,
  authorReviewStatus,
}: PrItemHeaderRowProps) => (
  <div className="flex items-center gap-1 mb-1.5">
    <PRStatusIcon type={prType} reviewed={isReviewed} />
    <PrItemTruncatedTitle title={title} isFirst={isFirst} isReviewed={isReviewed} />
    <div className="flex items-center gap-1 shrink-0">
      {isReviewed && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-base-300 text-base-content/70 text-[11px] font-medium">
          <CheckIcon width={10} height={10} className="flex-shrink-0" />
          Reviewed
        </span>
      )}
      {showAuthorStatus && authorReviewStatus && <StatusBadge status={authorReviewStatus} />}
    </div>
  </div>
);
