import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './App.css';
import App from './App.tsx';

// Create a client with extension-optimized settings
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Optimized for Chrome extensions
      staleTime: 1000 * 30, // 30 seconds
      gcTime: 1000 * 60 * 5, // 5 minutes
      retry: 2,
      refetchOnWindowFocus: false, // Extensions don't need window focus refetching
      refetchOnMount: true, // Always refetch when component mounts (popup opens)
    },
    mutations: {
      retry: 1,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
