import { RefreshButton } from './refresh-button';
import { useSetGlobalError, useClearGlobalError } from '../stores/global-error';
import { useMergedPRs } from '../hooks/use-merged-prs';
import { useAssignedPRs } from '../hooks/use-assigned-prs';
import { useAuthoredPRs } from '../hooks/use-authored-prs';
import { useRefreshMergedPRs } from '../hooks/use-refresh-merged-prs';
import { useRefreshAssignedPRs } from '../hooks/use-refresh-assigned-prs';
import { useRefreshAuthoredPRs } from '../hooks/use-refresh-authored-prs';
import { useRateLimitedRefresh } from '../hooks/use-rate-limited-refresh';
import { CountBadge } from './ui/count-badge';
import { useActiveTab, useSetActiveTab } from '../stores/tab-control';
import { useEffect, useState } from 'react';
import { NamedLogo } from './ui/named-logo';
import { useDebugMode, useResetDebugMode } from '../stores/debug';

const HEADER_DEMO_LAST_UPDATED = 'Updated 2m ago';

interface HeaderProps {
  prCount: number;
}

export const Header = ({ prCount }: HeaderProps) => {
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

  const activeTab = useActiveTab();
  const setActiveTab = useSetActiveTab();
  const isAssignedTabActive = activeTab === 'assigned';
  const [namedLogoHoverResetKey, setNamedLogoHoverResetKey] = useState(0);
  const handleCountClick = () => {
    if (!isAssignedTabActive) {
      setActiveTab('assigned');
    }
  };

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
    <div className="flex justify-between items-center gap-3 px-5 py-3.5 border-b border-base-300/90 bg-base-100 relative">
      <div className="min-w-0 flex-1 flex items-start gap-3  ">
        <div className="min-w-0 flex-1 flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="flex items-baseline gap-2 flex-wrap min-w-0 m-0 leading-none">
              <button
                type="button"
                onMouseLeave={() => setNamedLogoHoverResetKey((k) => k + 1)}
                aria-label="Pullwatch"
                className="text-left rounded-md -my-0.5 -mx-1 px-1 py-0.5 transition-colors duration-200 group hover:bg-primary/5"
              >
                <NamedLogo hoverResetKey={namedLogoHoverResetKey} />
              </button>
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-base-content/35 shrink-0">
                for GitHub
              </span>
            </h1>
            {prCount > 0 ? (
              <CountBadge
                value={prCount}
                size="md"
                tone={isAssignedTabActive ? 'primary' : 'neutral'}
                onClick={handleCountClick}
                clickable={!isAssignedTabActive}
              />
            ) : (
              <span className="inline-flex items-center rounded-full bg-success/12 text-success text-[11px] font-medium px-2 py-0.5 border border-success/20">
                All caught up
              </span>
            )}
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
          <p className="text-[11px] leading-snug text-base-content/50 tabular-nums m-0 pr-1">
            {HEADER_DEMO_LAST_UPDATED}
          </p>
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
