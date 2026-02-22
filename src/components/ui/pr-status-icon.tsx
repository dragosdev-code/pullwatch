import clsx from 'clsx';
import { PullRequestOpenIcon, PullRequestMergedIcon, PullRequestDraftIcon } from './icons';

type PRType = 'open' | 'merged' | 'draft';

interface PRStatusIconProps {
  type: PRType;
  reviewed?: boolean;
  className?: string;
}

export const PRStatusIcon = ({ type, reviewed = false, className }: PRStatusIconProps) => {
  const baseClasses = 'mr-2 flex-shrink-0';

  if (type === 'open') {
    return (
      <PullRequestOpenIcon
        className={clsx(
          baseClasses,
          reviewed ? 'text-success opacity-60' : 'text-success',
          className
        )}
      />
    );
  }

  if (type === 'merged') {
    return (
      <PullRequestMergedIcon
        className={clsx(
          baseClasses,
          reviewed ? 'text-secondary opacity-60' : 'text-accent',
          className
        )}
      />
    );
  }

  // draft
  return (
    <PullRequestDraftIcon
      className={clsx(
        baseClasses,
        reviewed ? 'text-neutral opacity-60' : 'text-neutral/00',
        className
      )}
    />
  );
};
