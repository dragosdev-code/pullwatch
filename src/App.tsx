import { useState, useEffect } from 'react';
import { Header, PRList, Footer, type PullRequest } from './components';

function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prs, setPrs] = useState<PullRequest[]>([]);
  const [showTitleParticles, setShowTitleParticles] = useState(false);
  const [hasEverLoaded, setHasEverLoaded] = useState(false);
  const [lastFetch, setLastFetch] = useState<number | null>(null);

  // Load PRs from storage on component mount
  useEffect(() => {
    loadPRsFromStorage();
  }, []);

  const loadPRsFromStorage = async () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        // We're in the extension context
        chrome.runtime.sendMessage(
          { action: 'getPRs' },
          (response: { prs: PullRequest[]; lastFetch: number | null }) => {
            if (chrome.runtime.lastError) {
              console.error('Error getting PRs from background:', chrome.runtime.lastError);
              return;
            }

            if (response) {
              const storedPRs = response.prs || [];
              setPrs(storedPRs);
              setLastFetch(response.lastFetch);
              setHasEverLoaded(storedPRs.length > 0 || response.lastFetch !== null);
            }
          }
        );
      }
    } catch (error) {
      console.error('Failed to load PRs from storage:', error);
    }
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        // We're in the extension context - ask background script to fetch
        chrome.runtime.sendMessage(
          { action: 'fetchPRs' },
          (response: { success: boolean; error?: string }) => {
            if (chrome.runtime.lastError) {
              setError('Failed to communicate with background script');
              setIsLoading(false);
              return;
            }

            if (response.success) {
              // Reload data from storage after successful fetch
              loadPRsFromStorage();
            } else {
              setError(response.error || 'Failed to fetch PRs');
            }
            setIsLoading(false);
          }
        );
      } else {
        // Fallback for development/web context
        setError('Extension context not available. Please load as Chrome extension.');
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Failed to fetch PRs:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to fetch pull requests. Please try again.'
      );
      setIsLoading(false);
    }
  };

  const handleTitleParticlesComplete = () => {
    setShowTitleParticles(false);
  };

  const formatLastFetch = (timestamp: number | null) => {
    if (!timestamp) return null;
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));

    if (minutes < 1) return 'Just now';
    if (minutes === 1) return '1 minute ago';
    if (minutes < 60) return `${minutes} minutes ago`;

    const hours = Math.floor(minutes / 60);
    if (hours === 1) return '1 hour ago';
    return `${hours} hours ago`;
  };

  return (
    <div className="w-[380px] h-[400px] bg-white rounded-2xl relative overflow-hidden border-0 shadow-none flex flex-col">
      <Header
        prCount={prs.length}
        isLoading={isLoading}
        showTitleParticles={showTitleParticles}
        onRefresh={handleRefresh}
        onTitleParticlesComplete={handleTitleParticlesComplete}
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

      {lastFetch && (
        <div className="px-5 py-2 bg-gray-50 border-b border-gray-200">
          <p className="text-xs text-gray-500">Last updated: {formatLastFetch(lastFetch)}</p>
        </div>
      )}

      <PRList prs={prs} newPrIds={new Set()} hasEverLoaded={hasEverLoaded} />

      <Footer />
    </div>
  );
}

export default App;
