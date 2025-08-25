import { useEffect, useMemo } from 'react';
import { Header, PRList, Footer, Tabs, TabPanel, type Tab } from './components';
import { TestArea } from './components/TestArea';
import { usePRs, useMergedPRs, usePRUpdates } from './hooks';
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
  const prUpdates = usePRUpdates();

  useEffect(() => {
    const cleanup = prUpdates.setupListener();
    return cleanup;
  }, [prUpdates]);

  const hasEverLoaded = isSuccess || prs.length > 0;

  const tabs: Tab[] = useMemo(
    () => [
      { id: 'reviews', label: 'To Review', count: prs.length },
      { id: 'changes', label: 'Need Changes', count: 0 },
      { id: 'merged', label: 'Merged', count: mergedPRs.length },
    ],
    [prs.length, mergedPRs.length]
  );

  const handleTabChange = (tabId: string) => {
    console.log('Tab changed to:', tabId);
    //TODO: Add any additional logic when tabs change
  };

  return (
    <div className="w-[380px] h-[400px] bg-white rounded-2xl relative overflow-hidden border-0 shadow-none flex flex-col">
      <Header prCount={prs.length} />

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
        <TabPanel tabId="reviews" className="flex-1 flex flex-col">
          <PRList
            prs={prs}
            newPrIds={new Set(prs.filter((pr) => pr.isNew).map((pr) => pr.id))}
            hasEverLoaded={hasEverLoaded}
          />
        </TabPanel>

        <TabPanel tabId="changes" className="flex-1 flex flex-col">
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center">
              <div className="text-2xl mb-2">🔄</div>
              <p className="text-sm text-gray-600 font-medium mb-1">Changes Requested</p>
              <p className="text-xs text-gray-500">PRs that need your attention</p>
            </div>
          </div>
        </TabPanel>

        <TabPanel tabId="merged" className="flex-1 flex flex-col">
          <PRList
            prs={mergedPRs}
            newPrIds={new Set(mergedPRs.filter((pr) => pr.isNew).map((pr) => pr.id))}
            hasEverLoaded={hasEverLoaded}
          />
        </TabPanel>
      </Tabs>

      <Footer />
    </div>
  );
}

export default App;
