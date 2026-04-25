import { useMemo } from 'react';
import { Header } from '@src/components/header';
import { Tabs } from '@src/components/ui/tabs/tabs';
import { TabPanel } from '@src/components/ui/tabs/tab-panel';
import type { Tab } from '@src/components/ui/tabs/types';
import { AssignedList } from '@src/components/lists/assigned-list';
import { AuthoredList } from '@src/components/lists/authored-list';
import { MergedList } from '@src/components/lists/merged-list';
import { DevTestArea } from '@src/components/dev-test-area';
import { OnboardingGate } from '@src/components/onboarding/onboarding-gate';
import { useAssignedPRs } from '@src/hooks/use-assigned-prs';
import { useMergedPRs } from '@src/hooks/use-merged-prs';
import { useAuthoredPRs } from '@src/hooks/use-authored-prs';
import { usePrEntranceViewedState } from '@src/hooks/use-pr-entrance-viewed-state';
import { useStorageSync } from '@src/hooks/use-storage-sync';
import { usePrListsStorageSync } from '@src/hooks/use-pr-lists-storage-sync';
import { useGlobalError, useClearGlobalError } from '@src/stores/global-error';
import { useDebugMode } from '@src/stores/debug';
import { DiagnosticsSurface } from '@src/diagnostics-surface';
import { SettingsOverlay } from '@src/components/settings';
import { ParserBreakageBanner } from '@src/components/parser-breakage-banner';
import { GitHubOutageBanner } from '@src/components/github-outage-banner';
import { MinigameDiscoveryProbe } from '@src/components/squash-minigame/minigame-discovery-probe';
import { TAB_IDS } from '@src/constants/tabs';

const AppShell = () => {
  const error = useGlobalError();
  const isDebugMode = useDebugMode();
  const clearGlobalError = useClearGlobalError();

  useStorageSync();
  usePrListsStorageSync();

  const { data: assignedPRs = [], isSuccess } = useAssignedPRs();
  const { data: mergedPRs = [] } = useMergedPRs();
  const { data: authoredPRs = [] } = useAuthoredPRs();

  const hasEverLoaded = isSuccess || assignedPRs.length > 0;

  const pendingPRCount = useMemo(
    () => assignedPRs.filter((pr) => pr.reviewStatus === 'pending').length,
    [assignedPRs],
  );

  const { assignedNewPrIds, mergedNewPrIds, markViewedIds, markViewedId } =
    usePrEntranceViewedState(assignedPRs, mergedPRs);

  const tabs: Tab[] = useMemo(
    () => [
      { id: TAB_IDS.ASSIGNED, label: 'To Review', count: pendingPRCount },
      { id: TAB_IDS.AUTHORED, label: 'Authored', count: authoredPRs.length },
      { id: TAB_IDS.MERGED, label: 'Merged', count: mergedPRs.length },
    ],
    [pendingPRCount, authoredPRs.length, mergedPRs.length],
  );

  const handleTabChange = (tabId: string) => {
    console.log('Tab changed to:', tabId);
  };

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden border-0 shadow-none">
      <DiagnosticsSurface />
      <Header />

      {error && (
        <div className="px-5 py-3 bg-error/10 border-b border-error/30">
          <p className="text-xs text-error">{error}</p>
          <button
            onClick={clearGlobalError}
            className="text-xs text-error/80 hover:text-error underline mt-1"
          >
            Dismiss
          </button>
        </div>
      )}

      <ParserBreakageBanner />
      <GitHubOutageBanner />

      {isDebugMode && <DevTestArea />}

      <Tabs tabs={tabs} className="flex-1 flex flex-col" onChange={handleTabChange}>
        <TabPanel tabId={TAB_IDS.ASSIGNED} className="flex-1 h-0">
          <AssignedList
            prs={assignedPRs}
            newPrIds={assignedNewPrIds}
            hasEverLoaded={hasEverLoaded}
            onViewIds={markViewedIds}
            onEntranceSeenOpen={markViewedId}
          />
        </TabPanel>

        <TabPanel tabId={TAB_IDS.AUTHORED} className="flex-1 h-0">
          <AuthoredList prs={authoredPRs} hasEverLoaded={hasEverLoaded} />
        </TabPanel>

        <TabPanel tabId={TAB_IDS.MERGED} className="flex-1 h-0">
          <MergedList
            prs={mergedPRs}
            newPrIds={mergedNewPrIds}
            hasEverLoaded={hasEverLoaded}
            onViewIds={markViewedIds}
            onEntranceSeenOpen={markViewedId}
          />
        </TabPanel>
      </Tabs>

      <SettingsOverlay position="right" />
      <MinigameDiscoveryProbe />
    </div>
  );
};

const App = () => (
  <OnboardingGate>
    <AppShell />
  </OnboardingGate>
);

export default App;
