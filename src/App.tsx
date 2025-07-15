import { useEffect } from 'react';
import { Header, PRList, Footer } from './components';
import { TestArea } from './components/TestArea';
import { usePRs, usePRUpdates } from './hooks';
import { useStorageSync } from './hooks/useStorageSync';
import { useGlobalError, useClearGlobalError, useDebugMode } from './stores';

function App() {
  const error = useGlobalError();
  const isDebugMode = useDebugMode();
  const clearGlobalError = useClearGlobalError();

  // Sync with Chrome storage
  useStorageSync();

  const { data: prs = [], isSuccess } = usePRs();
  const prUpdates = usePRUpdates();

  useEffect(() => {
    const cleanup = prUpdates.setupListener();
    return cleanup;
  }, [prUpdates]);

  const hasEverLoaded = isSuccess || prs.length > 0;

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

      <PRList
        prs={prs}
        newPrIds={new Set(prs.filter((pr) => pr.isNew).map((pr) => pr.id))}
        hasEverLoaded={hasEverLoaded}
      />

      <Footer />
    </div>
  );
}

export default App;
