import { useCallback, useEffect, useMemo, useState } from 'react';
import { Header, Tabs, TabPanel, type Tab } from './components';
import { AssignedList, AuthoredList, MergedList } from './components/lists';
import { TestArea } from './components/TestArea';
import { useAssignedPRs, useMergedPRs, useAuthoredPRs, usePRUpdates } from './hooks';
import { useStorageSync } from './hooks/useStorageSync';
import { useGlobalError, useClearGlobalError, useDebugMode } from './stores';

function App() {
  const error = useGlobalError();
  const isDebugMode = useDebugMode();
  const clearGlobalError = useClearGlobalError();

  // Sync with Chrome storage
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

  // Track which "new" PR IDs the user has already seen this session
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());

  const handleMarkAsViewed = useCallback((ids: string[]) => {
    setViewedIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  // Per-tab newPrIds: only PRs that are isNew AND not yet viewed
  const assignedNewPrIds = useMemo(
    () => new Set(assignedPRs.filter((pr) => pr.isNew && !viewedIds.has(pr.id)).map((pr) => pr.id)),
    [assignedPRs, viewedIds]
  );

  const authoredNewPrIds = useMemo(
    () => new Set(authoredPRs.filter((pr) => pr.isNew && !viewedIds.has(pr.id)).map((pr) => pr.id)),
    [authoredPRs, viewedIds]
  );

  const mergedNewPrIds = useMemo(
    () => new Set(mergedPRs.filter((pr) => pr.isNew && !viewedIds.has(pr.id)).map((pr) => pr.id)),
    [mergedPRs, viewedIds]
  );

  const tabs: Tab[] = useMemo(
    () => [
      { id: 'assigned', label: 'To Review', count: assignedPRs.length },
      { id: 'authored', label: 'Authored', count: authoredPRs.length },
      { id: 'merged', label: 'Merged', count: mergedPRs.length },
    ],
    [assignedPRs.length, authoredPRs.length, mergedPRs.length]
  );

  const handleTabChange = (tabId: string) => {
    console.log('Tab changed to:', tabId);
    //TODO: Add any additional logic when tabs change
  };

  return (
    <div className="w-[380px] h-[400px] bg-white rounded-2xl relative overflow-hidden border-0 shadow-none flex flex-col">
      <Header prCount={assignedPRs.length} />

      {error && (
        <div className="px-5 py-3 bg-red-50 border-b border-red-200">
          <p className="text-xs text-red-600">{error}</p>
          <button
            onClick={clearGlobalError}
            className="text-xs text-red-700 hover:text-red-800 underline mt-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {isDebugMode && <TestArea />}

      {/* Tabs Component */}
      <Tabs
        tabs={tabs}
        className="flex-1 flex flex-col"
        defaultTab="assigned"
        onChange={handleTabChange}
      >
        <TabPanel tabId="assigned" className="flex-1 h-0">
          <AssignedList
            prs={assignedPRs}
            newPrIds={assignedNewPrIds}
            hasEverLoaded={hasEverLoaded}
            onViewIds={handleMarkAsViewed}
          />
        </TabPanel>

        <TabPanel tabId="authored" className="flex-1 h-0">
          <AuthoredList
            prs={authoredPRs}
            newPrIds={authoredNewPrIds}
            hasEverLoaded={hasEverLoaded}
            onViewIds={handleMarkAsViewed}
          />
        </TabPanel>

        <TabPanel tabId="merged" className="flex-1 h-0">
          <MergedList
            prs={mergedPRs}
            newPrIds={mergedNewPrIds}
            hasEverLoaded={hasEverLoaded}
            onViewIds={handleMarkAsViewed}
          />
        </TabPanel>
      </Tabs>

      {/* <Footer /> */}
    </div>
  );
}

export default App;
