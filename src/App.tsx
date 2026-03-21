import { useEffect, useMemo } from 'react';
import { Header } from './components/header';
import { Tabs } from './components/ui/tabs/tabs';
import { TabPanel } from './components/ui/tabs/tab-panel';
import type { Tab } from './components/ui/tabs/types';
import { AssignedList } from './components/lists/assigned-list';
import { AuthoredList } from './components/lists/authored-list';
import { MergedList } from './components/lists/merged-list';
import { DevTestArea } from './components/dev-test-area/dev-test-area';
import { useAssignedPRs } from './hooks/use-assigned-prs';
import { useMergedPRs } from './hooks/use-merged-prs';
import { useAuthoredPRs } from './hooks/use-authored-prs';
import { usePRUpdates } from './hooks/use-pr-updates';
import { usePrEntranceViewedState } from './hooks/use-pr-entrance-viewed-state';
import { useStorageSync } from './hooks/use-storage-sync';
import { useGlobalError, useClearGlobalError } from './stores/global-error';
import { useDebugMode } from './stores/debug';
import { SettingsOverlay } from './components/settings/settings-overlay';
import { TAB_IDS } from './constants/tabs';

const App = () => {
  const error = useGlobalError();
  const isDebugMode = useDebugMode();
  const clearGlobalError = useClearGlobalError();

  useStorageSync();

  const { data: assignedPRs = [], isSuccess } = useAssignedPRs();
  const { data: mergedPRs = [] } = useMergedPRs();
  const { data: authoredPRs = [] } = useAuthoredPRs();
  const prUpdates = usePRUpdates();

  useEffect(() => {
    const cleanup = prUpdates.setupListener();
    return cleanup;
  }, [prUpdates]);

  const hasEverLoaded = isSuccess || assignedPRs.length > 0;

  const pendingPRCount = useMemo(
    () => assignedPRs.filter((pr) => pr.reviewStatus === 'pending').length,
    [assignedPRs]
  );

  const { assignedNewPrIds, mergedNewPrIds, markViewedIds, markViewedId } = usePrEntranceViewedState(
    assignedPRs,
    mergedPRs
  );

  const tabs: Tab[] = useMemo(
    () => [
      { id: TAB_IDS.ASSIGNED, label: 'To Review', count: pendingPRCount },
      { id: TAB_IDS.AUTHORED, label: 'Authored', count: authoredPRs.length },
      { id: TAB_IDS.MERGED, label: 'Merged', count: mergedPRs.length },
    ],
    [pendingPRCount, authoredPRs.length, mergedPRs.length]
  );

  const handleTabChange = (tabId: string) => {
    console.log('Tab changed to:', tabId);
  };

  return (
    <div className="w-[380px] h-[400px] bg-base-100 relative overflow-hidden border-0 shadow-none flex flex-col">
      <Header prCount={pendingPRCount} />

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
    </div>
  );
};

export default App;
