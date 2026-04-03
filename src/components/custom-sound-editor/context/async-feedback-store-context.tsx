import { createContext, useContext, useRef, type ReactNode } from 'react';
import type { AsyncFeedbackStore } from '../store/async-feedback-store';
import { createAsyncFeedbackStore } from '../store/async-feedback-store';

const AsyncFeedbackStoreContext = createContext<AsyncFeedbackStore | null>(null);

export function AsyncFeedbackStoreProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<AsyncFeedbackStore | undefined>(undefined);
  if (!storeRef.current) {
    storeRef.current = createAsyncFeedbackStore();
  }
  return (
    <AsyncFeedbackStoreContext.Provider value={storeRef.current}>
      {children}
    </AsyncFeedbackStoreContext.Provider>
  );
}

export function useAsyncFeedbackStore(): AsyncFeedbackStore {
  const store = useContext(AsyncFeedbackStoreContext);
  if (!store) {
    throw new Error('useAsyncFeedbackStore must be used within AsyncFeedbackStoreProvider');
  }
  return store;
}
