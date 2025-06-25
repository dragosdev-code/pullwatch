import { useState, useEffect } from 'react';
import { Header, PRList, Footer } from './components';
import { TestArea } from './components/TestArea';
import { usePRs, useRefreshPRs, usePRUpdates, useDebug } from './hooks';

function App() {
  const [error, setError] = useState<string | null>(null);
  const { isDebugMode } = useDebug();

  const { data: prs = [], isLoading, error: queryError, isSuccess } = usePRs();
  const refreshPRsMutation = useRefreshPRs();
  const prUpdates = usePRUpdates();

  useEffect(() => {
    const cleanup = prUpdates.setupListener();
    return cleanup;
  }, [prUpdates]);

  useEffect(() => {
    if (queryError) {
      setError(queryError.message);
    }
  }, [queryError]);

  const handleRefresh = async () => {
    setError(null);
    try {
      await refreshPRsMutation.mutateAsync();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh PRs';
      setError(errorMessage);
    }
  };

  const hasEverLoaded = isSuccess || prs.length > 0;

  return (
    <div className="w-[380px] h-[400px] bg-white rounded-2xl relative overflow-hidden border-0 shadow-none flex flex-col">
      <Header
        prCount={prs.length}
        isLoading={isLoading || refreshPRsMutation.isPending}
        onRefresh={handleRefresh}
      />

      {error && (
        <div className="px-5 py-3 bg-red-50 border-b border-red-200">
          <p className="text-xs text-red-600">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-xs text-red-700 hover:text-red-800 underline mt-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {isDebugMode && <TestArea setError={setError} />}

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
