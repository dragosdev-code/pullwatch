import { createContext, useContext, useRef, type ReactNode } from 'react';
import type { AudioDraftStore } from '../store/audio-draft-store';
import { createAudioDraftStore } from '../store/audio-draft-store';

const AudioDraftStoreContext = createContext<AudioDraftStore | null>(null);

export function AudioDraftStoreProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<AudioDraftStore | undefined>(undefined);
  if (!storeRef.current) {
    storeRef.current = createAudioDraftStore();
  }
  return (
    <AudioDraftStoreContext.Provider value={storeRef.current}>{children}</AudioDraftStoreContext.Provider>
  );
}

/** Per-modal-instance draft store; fails fast if used outside the editor tree. */
export function useAudioDraftStore(): AudioDraftStore {
  const store = useContext(AudioDraftStoreContext);
  if (!store) {
    throw new Error('useAudioDraftStore must be used within AudioDraftStoreProvider');
  }
  return store;
}
