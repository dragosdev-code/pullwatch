import { useEffect } from 'react';
import type { PullRequest } from '../../../extension/common/types';
import { PRItem } from '../pr-item';
import { PRListEmptyState } from './pr-list-empty-state';

interface MergedListProps {
  prs: PullRequest[];
  newPrIds: Set<string>;
  hasEverLoaded: boolean;
  onViewIds: (ids: string[]) => void;
}

export const MergedList = ({ prs, newPrIds, hasEverLoaded, onViewIds }: MergedListProps) => {
  // Mark new PRs as viewed when this component unmounts (user switches tabs)
  useEffect(() => {
    return () => {
      const idsToMark = prs.filter((pr) => newPrIds.has(pr.id)).map((pr) => pr.id);
      if (idsToMark.length > 0) onViewIds(idsToMark);
    };
  }, [prs, newPrIds, onViewIds]);

  if (prs.length === 0) {
    return (
      <PRListEmptyState
        message="No merged PRs"
        subMessage="Merged PRs will appear here"
        hasEverLoaded={hasEverLoaded}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {prs.length > 0 && (
        <>
          {prs.map((pr) => (
            <PRItem key={pr.id} pr={pr} isNew={newPrIds.has(pr.id)} />
          ))}
        </>
      )}
    </div>
  );
};
