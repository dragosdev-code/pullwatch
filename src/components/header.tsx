import { RefreshButton } from './refresh-button';
import { useSetGlobalError, useClearGlobalError } from '../stores/global-error';
import { useMergedPRs } from '../hooks/use-merged-prs';
import { useAssignedPRs } from '../hooks/use-assigned-prs';
import { useAuthoredPRs } from '../hooks/use-authored-prs';
import { useRefreshMergedPRs } from '../hooks/use-refresh-merged-prs';
import { useRefreshAssignedPRs } from '../hooks/use-refresh-assigned-prs';
import { useRefreshAuthoredPRs } from '../hooks/use-refresh-authored-prs';
import { useRateLimitedRefresh } from '../hooks/use-rate-limited-refresh';
import { useEffect } from 'react';
import { NamedLogo } from './ui/named-logo';
import { useDebugMode, useResetDebugMode } from '../stores/debug';
import { useHeaderStorageSignals } from '../hooks/use-header-storage-signals';
import { HeaderLastUpdatedLabel } from './header-last-updated-label';

export const Header = () => {
  const isDebugMode = useDebugMode();
  const resetDebugMode = useResetDebugMode();
  const setGlobalError = useSetGlobalError();
  const clearGlobalError = useClearGlobalError();
  const { isLoading: isLoadingPRs, error: queryError } = useAssignedPRs();
  const refreshPRsMutation = useRefreshAssignedPRs();
  const { isLoading: isLoadingMergedPRs, error: queryErrorMerged } = useMergedPRs();
  const refreshMergedPRsMutation = useRefreshMergedPRs();
  const { isLoading: isLoadingAuthoredPRs, error: queryErrorAuthored } = useAuthoredPRs();
  const refreshAuthoredPRsMutation = useRefreshAuthoredPRs();

  const { lastFetchMs, backgroundFetchInProgress } = useHeaderStorageSignals();

  const {
    handleRefresh,
    manualFetchInProgress,
    fetchProgress01,
    fetchElapsedSeconds,
    cooldownProgress01,
    timeRemainingMs,
    canRefresh,
    lastInteractionWasThrottled,
    lastFetchDurationMs,
  } = useRateLimitedRefresh({
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
    <div className="flex justify-between items-center gap-3 px-5 py-3 border-b border-base-300/90 bg-base-100 relative">
      <div className="min-w-0 flex-1 flex items-start gap-3  ">
        <div className="min-w-0 flex-1 flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="flex items-baseline gap-2 flex-wrap min-w-0 m-0 leading-none">
              <NamedLogo />
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-base-content/35 shrink-0 cursor-default">
                for GitHub
              </span>
            </h1>
            {isDebugMode ? (
              <button
                type="button"
                onClick={() => resetDebugMode()}
                className="text-[10px] font-semibold uppercase tracking-wide text-warning hover:text-warning/90 px-2 py-0.5 rounded-md border border-warning/40 hover:bg-warning/10 shrink-0"
              >
                Close dev area
              </button>
            ) : null}
          </div>
          <HeaderLastUpdatedLabel
            lastFetchMs={lastFetchMs}
            isUpdating={manualFetchInProgress || backgroundFetchInProgress}
          />
        </div>
      </div>

      <RefreshButton
        manualFetchInProgress={manualFetchInProgress}
        onRefresh={handleRefresh}
        fetchProgress01={fetchProgress01}
        fetchElapsedSeconds={fetchElapsedSeconds}
        cooldownProgress01={cooldownProgress01}
        timeRemainingMs={timeRemainingMs}
        canRefresh={canRefresh}
        lastInteractionWasThrottled={lastInteractionWasThrottled}
        lastFetchDurationMs={lastFetchDurationMs}
      />
    </div>
  );
};
