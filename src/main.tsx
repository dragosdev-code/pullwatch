import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './app.css';
import App from './app';
import { hydratePrQueriesFromStorage } from './hydrate-pr-queries-from-storage';

// Create a client with extension-optimized settings
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Optimized for Chrome extensions
      staleTime: 1000 * 30, // 30 seconds
      gcTime: 1000 * 60 * 5, // 5 minutes
      retry: 2,
      refetchOnWindowFocus: false, // Extensions don't need window focus refetching
      // Safe default for extension popups: avoid queryFn on mount (e.g. behind onboarding gate).
      // Hooks that need a mount refetch must set refetchOnMount: true explicitly.
      refetchOnMount: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

void (async () => {
  await hydratePrQueriesFromStorage(queryClient);

  createRoot(document.getElementById('root')!).render(
    <div id="pw-app-root">
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </StrictMode>
    </div>
  );
})();
