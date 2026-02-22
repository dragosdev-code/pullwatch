import { useSpring, animated } from '@react-spring/web';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import type { PullRequest } from '../../extension/common/types';
import {
  PullRequestOpenIcon,
  PullRequestMergedIcon,
  PullRequestDraftIcon,
  CheckIcon,
  XIcon,
  ClockIcon,
  CommentIcon,
} from './ui/icons';

interface PRItemProps {
  pr: PullRequest;
  isNew: boolean;
  isReviewed?: boolean;
  showAuthorStatus?: boolean;
}

export const PRItem = ({
  pr,
  isNew,
  isReviewed = false,
  showAuthorStatus = false,
}: PRItemProps) => {
  // Determine the hover background color based on authorReviewStatus
  const getHoverBg = () => {
    if (!showAuthorStatus || !pr.authorReviewStatus) {
      return isReviewed ? 'hover:bg-base-200' : 'hover:bg-primary/8';
    }

    switch (pr.authorReviewStatus) {
      case 'changes_requested':
        return 'hover:bg-red-50';
      case 'approved':
        return 'hover:bg-green-50';
      case 'pending':
        return 'hover:bg-base-200';
      case 'commented':
        return 'hover:bg-blue-50';
      case 'draft':
        return 'hover:bg-base-200';
      default:
        return 'hover:bg-primary/8';
    }
  };
  const slideSpring = useSpring({
    from: isNew
      ? {
          opacity: 0,
          transform: 'translateY(-30px) scale(0.95)',
          filter: 'blur(1px)',
        }
      : {
          opacity: 1,
          transform: 'translateY(0px) scale(1)',
          filter: 'blur(0px)',
        },
    to: {
      opacity: 1,
      transform: 'translateY(0px) scale(1)',
      filter: 'blur(0px)',
    },
    config: {
      tension: 700,
      friction: 25,
      mass: 0.1,
    },
  });

  const formatTimeAgo = (dateString: string) => {
    try {
      const date = new Date(dateString);
      // Check if the date is valid
      if (isNaN(date.getTime())) {
        return 'Unknown date';
      }
      return formatDistanceToNow(date, { addSuffix: true });
    } catch (error) {
      console.warn('Invalid date string:', dateString, error);
      return 'Unknown date';
    }
  };

  return (
    <animated.a
      href={pr.url}
      target="_blank"
      rel="noopener noreferrer"
      style={isNew && !isReviewed ? slideSpring : {}}
      data-pr-id={pr.id}
      className={clsx(
        'group block px-5 py-3 transition-all duration-200 cursor-pointer relative border-b border-base-200',
        isReviewed
          ? 'bg-base-200 text-base-content/70 opacity-90 border-l-2 hover:opacity-100'
          : `bg-base-100 text-base-content border-l-2 ${getHoverBg()}`,
        isNew && !isReviewed && 'shadow-sm'
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center mb-1">
            {pr.type === 'open' && <PullRequestOpenIcon reviewed={isReviewed} />}

            {pr.type === 'merged' && <PullRequestMergedIcon reviewed={isReviewed} />}

            {pr.type === 'draft' && <PullRequestDraftIcon reviewed={isReviewed} />}

            <h3
              className={clsx(
                'text-sm font-medium truncate',
                isReviewed ? 'text-base-content/60' : 'text-base-content'
              )}
            >
              {pr.title}
            </h3>
            {isReviewed && (
              <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-base-300 text-base-content/70 text-[11px] font-medium">
                <CheckIcon width={10} height={10} className="flex-shrink-0" />
                Reviewed
              </span>
            )}
            {showAuthorStatus && pr.authorReviewStatus && (
              <>
                {pr.authorReviewStatus === 'changes_requested' && (
                  <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[11px] font-medium">
                    <XIcon width={10} height={10} className="flex-shrink-0" />
                    Requested
                  </span>
                )}
                {pr.authorReviewStatus === 'approved' && (
                  <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-100 text-green-700 text-[11px] font-medium">
                    <CheckIcon width={10} height={10} className="flex-shrink-0" />
                    Approved
                  </span>
                )}
                {pr.authorReviewStatus === 'pending' && (
                  <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[11px] font-medium">
                    <ClockIcon width={10} height={10} className="flex-shrink-0" />
                    Pending
                  </span>
                )}
                {pr.authorReviewStatus === 'commented' && (
                  <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[11px] font-medium">
                    <CommentIcon width={10} height={10} className="flex-shrink-0" />
                    Commented
                  </span>
                )}
                {pr.authorReviewStatus === 'draft' && (
                  <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px] font-medium">
                    <PullRequestDraftIcon reviewed={true} className="flex-shrink-0" />
                    Draft
                  </span>
                )}
              </>
            )}
          </div>
          <p
            className={clsx(
              'text-xs truncate',
              isReviewed ? 'text-base-content/40' : 'text-base-content/50'
            )}
          >
            {pr.repoName} • {pr.author.login} • {formatTimeAgo(pr.createdAt || '')}
          </p>
        </div>
      </div>
    </animated.a>
  );
};
