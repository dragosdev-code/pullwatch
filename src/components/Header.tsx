import { RefreshButton } from './RefreshButton';
import {
  useHandleGithubClick,
  useDebugPending,
  useSetGlobalError,
  useClearGlobalError,
} from '../stores';
import { usePRs, useRefreshPRs } from '../hooks';
import { useEffect } from 'react';

interface HeaderProps {
  prCount: number;
}

export const Header = ({ prCount }: HeaderProps) => {
  const handleGithubClick = useHandleGithubClick();
  const isDebugPending = useDebugPending();
  const setGlobalError = useSetGlobalError();
  const clearGlobalError = useClearGlobalError();
  const { isLoading: isLoadingPRs, error: queryError } = usePRs();
  const refreshPRsMutation = useRefreshPRs();

  useEffect(() => {
    if (queryError) {
      setGlobalError(queryError.message);
    }
  }, [queryError, setGlobalError]);

  const handleRefresh = async () => {
    clearGlobalError();
    try {
      await refreshPRsMutation.mutateAsync();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh PRs';
      setGlobalError(errorMessage);
    }
  };

  return (
    <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100 relative">
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
        isLoading={refreshPRsMutation.isPending || isLoadingPRs}
        onRefresh={handleRefresh}
      />
    </div>
  );
};
