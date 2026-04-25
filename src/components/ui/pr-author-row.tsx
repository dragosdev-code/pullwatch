import clsx from 'clsx';
import type { PullRequestAuthor } from '@common/types';

const UNKNOWN = 'Unknown Author';

export interface PrAuthorRowProps {
  authors: PullRequestAuthor[];
  isReviewed?: boolean;
  /** Aligns author +N tooltip with the title row (first item uses bottom tooltip). */
  isFirst?: boolean;
}

export const PrAuthorRow = ({ authors, isReviewed = false, isFirst = false }: PrAuthorRowProps) => {
  const list = authors.length > 0 ? authors : [{ login: UNKNOWN }];
  const primary = list[0];
  const rest = list.slice(1);
  const restCount = rest.length;
  const restLabel = rest.map((a) => a.login).join(', ');

  const ringClass = isReviewed ? 'ring-base-200' : 'ring-base-100';
  const stackedHover = list.length > 1;

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <div className="flex flex-row items-center shrink-0 pl-0.5">
        {list.map((person, index) => {
          const initial = person.login.charAt(0).toUpperCase();
          const zBase = 10 + index;
          return (
            <div
              key={`${person.login}-${index}`}
              className={clsx(
                'relative shrink-0 rounded-full duration-150 ease-out',
                stackedHover && 'transition-[transform,z-index] hover:!z-[100] hover:scale-110',
                index > 0 && '-ml-2'
              )}
              style={{ zIndex: zBase }}
            >
              {person.avatarUrl ? (
                <img
                  src={person.avatarUrl}
                  alt={person.login}
                  className={clsx('w-5 h-5 rounded-full object-cover block', 'ring-2', ringClass)}
                />
              ) : (
                <span
                  className={clsx(
                    'w-5 h-5 rounded-full inline-flex items-center justify-center text-[9px] font-bold ring-2',
                    ringClass,
                    isReviewed
                      ? 'bg-base-300 text-base-content/40'
                      : 'bg-base-300 text-base-content/60'
                  )}
                  aria-hidden
                >
                  {initial}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-1 min-w-0 flex-1 ml-[2px]">
        <span
          className={clsx(
            'text-xs truncate',
            isReviewed ? 'text-base-content/40' : 'text-base-content/60'
          )}
        >
          {primary.login}
        </span>
        {restCount > 0 && (
          <div
            className={clsx(
              'shrink-0 tooltip rounded-md tooltip-neutral',
              isFirst ? 'tooltip-bottom' : 'tooltip-top'
            )}
          >
            <div className="tooltip-content z-[9999] p-0 rounded-md max-w-[240px]">
              <div className="font-medium text-xs px-2.5 py-1.5 rounded-md whitespace-normal leading-snug text-left">
                {restLabel}
              </div>
            </div>
            <span
              className={clsx(
                'inline-flex items-center justify-center min-w-[1.25rem] px-1 py-0 rounded font-medium text-[11px] tabular-nums cursor-default',
                isReviewed
                  ? 'bg-base-300/80 text-base-content/50'
                  : 'bg-base-200 text-base-content/65'
              )}
              aria-label={`Also assigned: ${restLabel}`}
            >
              +{restCount}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
