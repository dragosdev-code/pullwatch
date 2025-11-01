import { useEffect, useMemo } from 'react';
import { Header, PRList, Tabs, TabPanel, type Tab } from './components';
import { TestArea } from './components/TestArea';
import { usePRs, useMergedPRs, useAuthoredPRs, usePRUpdates } from './hooks';
import { useStorageSync } from './hooks/useStorageSync';
import { useGlobalError, useClearGlobalError, useDebugMode } from './stores';

function App() {
  const error = useGlobalError();
  const isDebugMode = useDebugMode();
  const clearGlobalError = useClearGlobalError();

  // Sync with Chrome storage
  useStorageSync();

  const { data: prs = [], isSuccess } = usePRs();
  const { data: mergedPRs = [] } = useMergedPRs();
  const { data: authoredPRs = [] } = useAuthoredPRs();
  const prUpdates = usePRUpdates();

  useEffect(() => {
    const cleanup = prUpdates.setupListener();
    return cleanup;
  }, [prUpdates]);

  const pendingPRs = useMemo(() => prs.filter((pr) => pr.reviewStatus !== 'reviewed'), [prs]);
  const reviewedPRs = useMemo(() => prs.filter((pr) => pr.reviewStatus === 'reviewed'), [prs]);

  const orderedPRs = useMemo(() => [...pendingPRs, ...reviewedPRs], [pendingPRs, reviewedPRs]);

  const hasEverLoaded = isSuccess || prs.length > 0;

  const tabs: Tab[] = useMemo(
    () => [
      { id: 'reviews', label: 'To Review', count: pendingPRs.length },
      { id: 'authored', label: 'Authored', count: authoredPRs.length },
      { id: 'merged', label: 'Merged', count: mergedPRs.length },
    ],
    [pendingPRs.length, authoredPRs.length, mergedPRs.length]
  );

  const handleTabChange = (tabId: string) => {
    console.log('Tab changed to:', tabId);
    //TODO: Add any additional logic when tabs change
  };

  return (
    <div className="w-[380px] h-[400px] bg-white rounded-2xl relative overflow-hidden border-0 shadow-none flex flex-col">
      <Header prCount={pendingPRs.length} />

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
        defaultTab="reviews"
        onChange={handleTabChange}
      >
        <TabPanel tabId="reviews" className="flex-1 h-0">
          <PRList
            prs={orderedPRs}
            newPrIds={new Set(orderedPRs.filter((pr) => pr.isNew).map((pr) => pr.id))}
            hasEverLoaded={hasEverLoaded}
          />
        </TabPanel>

        <TabPanel tabId="authored" className="flex-1 h-0">
          <PRList
            prs={authoredPRs}
            newPrIds={new Set(authoredPRs.filter((pr) => pr.isNew).map((pr) => pr.id))}
            hasEverLoaded={hasEverLoaded}
            isAuthoredTab
          />
        </TabPanel>

        <TabPanel tabId="merged" className="flex-1 h-0">
          <PRList
            prs={mergedPRs}
            newPrIds={new Set(mergedPRs.filter((pr) => pr.isNew).map((pr) => pr.id))}
            hasEverLoaded={hasEverLoaded}
          />
        </TabPanel>
      </Tabs>

      {/* <Footer /> */}
    </div>
  );
}

export default App;
