import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { CustomSoundId } from '../../../../extension/common/types';

type SavedDeleteUiValue = {
  pendingDeleteId: CustomSoundId | null;
  setPendingDeleteId: (id: CustomSoundId | null) => void;
  clearPendingDelete: () => void;
};

const SavedDeleteUiContext = createContext<SavedDeleteUiValue | null>(null);

/**
 * Saved-sounds list delete confirmation only — unrelated to draft audio / trim.
 * Context+useState keeps this slice minimal without Zustand overhead.
 */
export function SavedDeleteUiProvider({ children }: { children: ReactNode }) {
  const [pendingDeleteId, setPendingDeleteId] = useState<CustomSoundId | null>(null);
  const clearPendingDelete = useCallback(() => setPendingDeleteId(null), []);

  const value = useMemo(
    () => ({ pendingDeleteId, setPendingDeleteId, clearPendingDelete }),
    [pendingDeleteId, clearPendingDelete],
  );

  return (
    <SavedDeleteUiContext.Provider value={value}>{children}</SavedDeleteUiContext.Provider>
  );
}

export function useSavedDeleteUi(): SavedDeleteUiValue {
  const ctx = useContext(SavedDeleteUiContext);
  if (!ctx) {
    throw new Error('useSavedDeleteUi must be used within SavedDeleteUiProvider');
  }
  return ctx;
}
