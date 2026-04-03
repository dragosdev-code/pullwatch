import type { PullRequest } from '../../../../extension/common/types';
import clsx from 'clsx';
import { PrAuthorRow } from '../../ui/pr-author-row';
import { formatTimeAgo } from '../utils/format-time-ago';

interface PrItemFooterRowProps {
  authors: PullRequest['author'];
  createdAt: string;
  isReviewed: boolean;
  isFirst: boolean;
}

export const PrItemFooterRow = ({
  authors,
  createdAt,
  isReviewed,
  isFirst,
}: PrItemFooterRowProps) => (
  <div className="flex items-center justify-between gap-2">
    <div className="min-w-0 flex-1 mr-1">
      <PrAuthorRow authors={authors} isReviewed={isReviewed} isFirst={isFirst} />
    </div>
    <span
      className={clsx(
        'text-[11px] shrink-0',
        isReviewed ? 'text-base-content/35' : 'text-base-content/45'
      )}
    >
      {formatTimeAgo(createdAt || '')}
    </span>
  </div>
);
