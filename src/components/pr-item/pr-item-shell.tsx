import { animated } from '@react-spring/web';
import clsx from 'clsx';
import { useCallback, useState } from 'react';
import { PrItemFooterRow } from './components/pr-item-footer-row';
import { PrItemHeaderRow } from './components/pr-item-header-row';
import { PrItemRepoRow } from './components/pr-item-repo-row';
import type { PRItemProps } from './types';
import { usePrEntranceSpring } from './hooks/use-pr-entrance-spring';
import { usePrLinkClick } from './hooks/use-pr-link-click';

export function PrItemShell({
  pr,
  isNew,
  isFirst = false,
  isReviewed = false,
  showAuthorStatus = false,
  onPrLinkActivated,
}: PRItemProps) {
  const handleClick = usePrLinkClick({
    url: pr.url,
    prId: pr.id,
    onPrLinkActivated,
  });
  const slideSpring = usePrEntranceSpring(isNew);
  const [titleTooltipStackLift, setTitleTooltipStackLift] = useState(false);
  const handleTitleTooltipStackLiftChange = useCallback((lifted: boolean) => {
    setTitleTooltipStackLift(lifted);
  }, []);

  return (
    <animated.a
      href={pr.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      style={isNew && !isReviewed ? slideSpring : {}}
      data-pr-id={pr.id}
      className={clsx(
        'group block px-5 py-2 transition-[color,background-color,border-color,opacity,box-shadow] duration-200 cursor-pointer relative isolate border-b border-base-200',
        titleTooltipStackLift ? 'z-10' : 'hover:z-10',
        isReviewed
          ? 'bg-base-200 text-base-content/70 opacity-90 border-l-2 hover:opacity-100'
          : 'bg-base-100 text-base-content border-l-2 hover:bg-base-200',
        isNew && !isReviewed && 'shadow-sm'
      )}
    >
      <PrItemHeaderRow
        prType={pr.type}
        title={pr.title}
        isFirst={isFirst}
        isReviewed={isReviewed}
        showAuthorStatus={showAuthorStatus}
        authorReviewStatus={pr.authorReviewStatus}
        onTruncatedTitleStackLiftChange={handleTitleTooltipStackLiftChange}
      />
      <PrItemRepoRow repoName={pr.repoName} number={pr.number} isReviewed={isReviewed} />
      <PrItemFooterRow
        authors={pr.author}
        createdAt={pr.createdAt || ''}
        isReviewed={isReviewed}
        isFirst={isFirst}
      />
    </animated.a>
  );
}
