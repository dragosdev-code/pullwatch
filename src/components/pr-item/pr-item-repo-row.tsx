import clsx from 'clsx';
import { RepoIcon } from '../ui/icons';

interface PrItemRepoRowProps {
  repoName: string;
  number: number | null;
  isReviewed: boolean;
}

export const PrItemRepoRow = ({ repoName, number, isReviewed }: PrItemRepoRowProps) => (
  <div className="flex items-center justify-between gap-2 mb-1">
    <div className="flex items-center gap-1.5 min-w-0">
      <RepoIcon
        width={11}
        height={11}
        className={clsx('shrink-0', isReviewed ? 'text-base-content/35' : 'text-base-content/50')}
      />
      <span
        className={clsx(
          'font-mono text-[11px] px-1.5 py-0.5 rounded truncate ml-[2.5px]',
          isReviewed ? 'bg-base-300/60 text-base-content/45' : 'bg-base-200 text-base-content/65'
        )}
      >
        {repoName}
      </span>
    </div>
    {number !== null && (
      <span
        className={clsx(
          'text-[11px] font-mono shrink-0',
          isReviewed ? 'text-base-content/35' : 'text-base-content/50'
        )}
      >
        #{number}
      </span>
    )}
  </div>
);
