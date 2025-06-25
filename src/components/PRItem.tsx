import { useSpring, animated } from '@react-spring/web';
import { formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import type { PullRequest } from '../../extension/common/types';

interface PRItemProps {
  pr: PullRequest;
  isNew: boolean;
}

export const PRItem = ({ pr, isNew }: PRItemProps) => {
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
      style={isNew ? slideSpring : {}}
      data-pr-id={pr.id}
      className={clsx(
        'block px-5 py-3 transition-all duration-200 cursor-pointer relative border-b border-gray-50',
        'hover:bg-blue-50 hover:border-blue-100',
        isNew && 'bg-blue-25 border-blue-200'
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center mb-1">
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="currentColor"
              className="text-gray-400 mr-2 flex-shrink-0"
            >
              <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z" />
            </svg>
            <h3 className="text-sm text-gray-900 font-medium truncate">{pr.title}</h3>
            {isNew && (
              <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-800 text-xs font-medium rounded">
                New
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 truncate">
            {pr.repoName} • {pr.author.login} • {formatTimeAgo(pr.createdAt || '')}
          </p>
        </div>
        <div
          className="w-2.5 h-2.5 bg-red-500 rounded-full ml-3 flex-shrink-0 mt-1"
          style={{ display: 'none' }}
        ></div>
      </div>
    </animated.a>
  );
};
