import { useSpring, animated } from '@react-spring/web';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import type { PullRequest } from '../../extension/common/types';

interface PRItemProps {
  pr: PullRequest;
  isNew: boolean;
  isReviewed?: boolean;
}

export const PRItem = ({ pr, isNew, isReviewed = false }: PRItemProps) => {
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
        'group block px-5 py-3 transition-all duration-200 cursor-pointer relative border-b border-gray-100',
        isReviewed
          ? 'bg-gray-50 text-gray-700 opacity-90 border-l-2 border-l-gray-200 hover:bg-gray-100 hover:opacity-100 hover:border-l-gray-300'
          : 'bg-white text-gray-900 border-l-2 border-l-blue-500 hover:border-l-blue-600 hover:bg-blue-50',
        isNew && !isReviewed && 'shadow-sm'
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center mb-1">
            {pr.type === 'open' && (
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="currentColor"
                className={clsx(
                  'mr-2 flex-shrink-0',
                  isReviewed ? 'text-emerald-500 opacity-60' : 'text-green-500'
                )}
              >
                <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z" />
              </svg>
            )}

            {pr.type === 'merged' && (
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="currentColor"
                className={clsx(
                  'mr-2 flex-shrink-0',
                  isReviewed ? 'text-purple-400 opacity-60' : 'text-purple-600'
                )}
              >
                <path d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 3.25a.75.75 0 1 0 0 .005V3.25Z"></path>
              </svg>
            )}

            {pr.type === 'draft' && (
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="currentColor"
                className={clsx(
                  'mr-2 flex-shrink-0',
                  isReviewed ? 'text-gray-400 opacity-60' : 'text-gray-500'
                )}
              >
                <path d="M3.25 1A2.25 2.25 0 0 1 4 5.372v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.251 2.251 0 0 1 3.25 1Zm9.5 14a2.25 2.25 0 1 1 0-4.5 2.25 2.25 0 0 1 0 4.5ZM2.5 3.25a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0ZM3.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm9.5 0a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM14 7.5a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Zm0-4.25a1.25 1.25 0 1 1-2.5 0 1.25 1.25 0 0 1 2.5 0Z"></path>
              </svg>
            )}
            <h3
              className={clsx(
                'text-sm font-medium truncate',
                isReviewed ? 'text-gray-600' : 'text-gray-900'
              )}
            >
              {pr.title}
            </h3>
            {isReviewed && (
              <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 text-[11px] font-medium">
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 16 16"
                  fill="currentColor"
                  aria-hidden="true"
                  className="flex-shrink-0"
                >
                  <path d="M13.78 3.22a.75.75 0 0 1 0 1.06l-6 6a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 0 1 1.06-1.06L7 8.69l5.47-5.47a.75.75 0 0 1 1.06 0Z" />
                </svg>
                Reviewed
              </span>
            )}
          </div>
          <p className={clsx('text-xs truncate', isReviewed ? 'text-gray-400' : 'text-gray-500')}>
            {pr.repoName} • {pr.author.login} • {formatTimeAgo(pr.createdAt || '')}
          </p>
        </div>
      </div>
    </animated.a>
  );
};
