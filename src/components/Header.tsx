import { RefreshButton } from './refresh-button';
import { useSetGlobalError, useClearGlobalError } from '../stores/global-error';
import { useHandleGithubClick, useDebugPending } from '../stores/debug';
import { useMergedPRs } from '../hooks/use-merged-prs';
import { useAssignedPRs } from '../hooks/use-assigned-prs';
import { useAuthoredPRs } from '../hooks/use-authored-prs';
import { useRefreshMergedPRs } from '../hooks/use-refresh-merged-prs';
import { useRefreshAssignedPRs } from '../hooks/use-refresh-assigned-prs';
import { useRefreshAuthoredPRs } from '../hooks/use-refresh-authored-prs';
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

  useEffect(() => {
    if (queryError || queryErrorMerged || queryErrorAuthored) {
      setGlobalError(
        queryError?.message || queryErrorMerged?.message || queryErrorAuthored?.message || ''
      );
    }
  }, [queryError, queryErrorMerged, queryErrorAuthored, setGlobalError]);

  const handleRefresh = async () => {
    clearGlobalError();
    try {
      await Promise.all([
        refreshPRsMutation.mutateAsync(),
        refreshMergedPRsMutation.mutateAsync(),
        refreshAuthoredPRsMutation.mutateAsync(),
      ]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh PRs';
      setGlobalError(errorMessage);
    }
  };

  return (
    <div className="flex justify-between items-center px-5 py-3 border-b border-gray-100 relative">
      <div className="flex items-center">
        <h1 className="text-base font-semibold text-gray-900">
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
        <span className="ml-2 px-2 py-1 bg-red-500 text-white text-xs font-bold rounded-full">
          {prCount}
        </span>
      </div>

      <RefreshButton
        isLoading={
          refreshPRsMutation.isPending ||
          isLoadingPRs ||
          refreshMergedPRsMutation.isPending ||
          isLoadingMergedPRs ||
          refreshAuthoredPRsMutation.isPending ||
          isLoadingAuthoredPRs
        }
        onRefresh={handleRefresh}
      />
    </div>
  );
};
