import { RefreshButton } from './refresh-button';
import { useSetGlobalError, useClearGlobalError } from '@src/stores/global-error';
import { useMergedPRs } from '@src/hooks/use-merged-prs';
import { useAssignedPRs } from '@src/hooks/use-assigned-prs';
import { useAuthoredPRs } from '@src/hooks/use-authored-prs';
import { useRefreshMergedPRs } from '@src/hooks/use-refresh-merged-prs';
import { useRefreshAssignedPRs } from '@src/hooks/use-refresh-assigned-prs';
import { useRefreshAuthoredPRs } from '@src/hooks/use-refresh-authored-prs';
import { useRateLimitedRefresh } from '@src/hooks/use-rate-limited-refresh';
import { useEffect } from 'react';
import { MINIGAME_DISCOVERY_THRESHOLD } from '@common/constants';
import { useSquashMinigameExperience } from '@src/components/squash-minigame/squash-minigame-experience-provider';
import { NamedLogo } from './ui/named-logo';
import { useDebugMode, useResetDebugMode } from '@src/stores/debug';
import { useHeaderStorageSignals } from '@src/hooks/use-header-storage-signals';
import { HeaderLastUpdatedLabel } from './header-last-updated-label';
import { useNamedLogoCelebrateOnNewPr } from '@src/hooks/use-named-logo-celebrate-on-new-pr';

export const Header = () => {
  const squash = useSquashMinigameExperience();
  const isDebugMode = useDebugMode();
  const resetDebugMode = useResetDebugMode();
  const setGlobalError = useSetGlobalError();
  const clearGlobalError = useClearGlobalError();
  const { data: assignedPRs = [], isLoading: isLoadingPRs, error: queryError } = useAssignedPRs();
  const refreshPRsMutation = useRefreshAssignedPRs();
  const {
    data: mergedPRs = [],
    isLoading: isLoadingMergedPRs,
    error: queryErrorMerged,
  } = useMergedPRs();
  const celebrateSignal = useNamedLogoCelebrateOnNewPr(assignedPRs, mergedPRs);
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

  const showMinigameCta =
    squash.ready &&
    squash.stats &&
    squash.stats.popupOpenCount >= MINIGAME_DISCOVERY_THRESHOLD &&
    !squash.stats.hasDiscovered;

  const handlePlayMinigame = async () => {
    const mode = squash.stats?.lastPlayedMode ?? 'standard';
    await squash.discoverMinigame();
    squash.openSquashGame(mode);
  };

  return (
    <div className="flex justify-between items-center gap-2 px-5 py-3 border-b border-base-300/90 bg-base-100 relative sm:gap-3">
      <div className="min-w-0 flex-1 flex items-start gap-3  ">
        <div className="min-w-0 flex-1 flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="flex items-baseline gap-2 flex-wrap min-w-0 m-0 leading-none">
              <NamedLogo celebrateSignal={celebrateSignal} />
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

      <div className="flex shrink-0 items-center gap-2">
        {showMinigameCta ? (
          <div className="flex max-w-[min(100%,11rem)] flex-col items-end gap-0.5 sm:max-w-none sm:flex-row sm:items-center sm:gap-2">
            <span className="text-right text-[9px] font-medium leading-tight text-base-content/75 sm:text-[10px]">
              Try this fun minigame
            </span>
            <button
              type="button"
              onClick={() => void handlePlayMinigame()}
              className="btn btn-primary btn-xs shrink-0 px-2.5 font-semibold uppercase tracking-wide"
            >
              Play
            </button>
          </div>
        ) : null}
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
    </div>
  );
};
