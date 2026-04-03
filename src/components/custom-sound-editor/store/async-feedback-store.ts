import { createStore } from 'zustand/vanilla';

/**
 * Decode/save pipeline status only — not trim geometry or list delete UX.
 * Isolates user-visible errors and saving spinner from the audio draft slice.
 */
export type AsyncFeedbackState = {
  error: string | null;
  isSaving: boolean;
  setError: (error: string | null) => void;
  setSaving: (isSaving: boolean) => void;
  reset: () => void;
};

export function createAsyncFeedbackStore() {
  return createStore<AsyncFeedbackState>()((set) => ({
    error: null,
    isSaving: false,
    setError: (error) => set({ error }),
    setSaving: (isSaving) => set({ isSaving }),
    reset: () => set({ error: null, isSaving: false }),
  }));
}

export type AsyncFeedbackStore = ReturnType<typeof createAsyncFeedbackStore>;
