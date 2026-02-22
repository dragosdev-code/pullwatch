import { RefreshButton } from './refresh-button';
import { useSetGlobalError, useClearGlobalError } from '../stores/global-error';
import { useHandleGithubClick, useDebugPending } from '../stores/debug';
import { useMergedPRs } from '../hooks/use-merged-prs';
import { useAssignedPRs } from '../hooks/use-assigned-prs';
import { useAuthoredPRs } from '../hooks/use-authored-prs';
import { useRefreshMergedPRs } from '../hooks/use-refresh-merged-prs';
import { useRefreshAssignedPRs } from '../hooks/use-refresh-assigned-prs';
import { useRefreshAuthoredPRs } from '../hooks/use-refresh-authored-prs';
import { useRateLimitedRefresh } from '../hooks/use-rate-limited-refresh';
import { CountBadge } from './ui/count-badge';
import { useEffect } from 'react';

interface HeaderProps {
  prCount: number;
}

export const Header = ({ prCount }: HeaderProps) => {
  const handleGithubClick = useHandleGithubClick();
  const isDebugPending = useDebugPending();
  const setGlobalError = useSetGlobalError();
  const clearGlobalError = useClearGlobalError();
  const { isLoading: isLoadingPRs, error: queryError } = useAssignedPRs();
  const refreshPRsMutation = useRefreshAssignedPRs();
  const { isLoading: isLoadingMergedPRs, error: queryErrorMerged } = useMergedPRs();
  const refreshMergedPRsMutation = useRefreshMergedPRs();
  const { isLoading: isLoadingAuthoredPRs, error: queryErrorAuthored } = useAuthoredPRs();
  const refreshAuthoredPRsMutation = useRefreshAuthoredPRs();

  const { isAnyLoading, handleRefresh } = useRateLimitedRefresh({
    refreshPRsMutation,
    refreshMergedPRsMutation,
    refreshAuthoredPRsMutation,
    isLoadingPRs,
    isLoadingMergedPRs,
    isLoadingAuthoredPRs,
    clearGlobalError,
    setGlobalError,
  });

  useEffect(() => {
    if (queryError || queryErrorMerged || queryErrorAuthored) {
      setGlobalError(
        queryError?.message || queryErrorMerged?.message || queryErrorAuthored?.message || ''
      );
    }
  }, [queryError, queryErrorMerged, queryErrorAuthored, setGlobalError]);

  return (
    <div className="flex justify-between items-center px-5 py-3 border-b border-base-300 relative">
      <div className="flex items-center">
        <h1 className="text-base font-semibold text-base-content">
          <button
            onClick={handleGithubClick}
            className={`transition-all duration-200 ${
              isDebugPending
                ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white px-2 py-1 rounded-md shadow-md hover:shadow-lg transform hover:scale-105'
                : ''
            }`}
            title={isDebugPending ? 'Click once more to enable debug mode' : 'Github Live Review'}
          >
            {isDebugPending ? '🔧 Debug Ready' : 'Github'}
          </button>
          {!isDebugPending && ' Live Review'}
        </h1>
        <CountBadge value={prCount} size="md" tone="primary" className="ml-2" />
      </div>

      <RefreshButton isLoading={isAnyLoading} onRefresh={handleRefresh} />
    </div>
  );
};
