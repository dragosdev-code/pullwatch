import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DebugState {
  isDebugMode: boolean;
  setDebugMode: (value: boolean) => void;
  resetDebugMode: () => void;

  chordSlotElement: HTMLButtonElement | null;
  bindChordSlot: (el: HTMLButtonElement | null) => void;

  diagnosticsPromptOpen: boolean;
  openDiagnosticsPrompt: () => void;
  closeDiagnosticsPrompt: () => void;
}

export const useDebugStore = create<DebugState>()(
  persist(
    (set) => ({
      isDebugMode: false,
      setDebugMode: (value: boolean) => set({ isDebugMode: value }),
      resetDebugMode: () =>
        set({
          isDebugMode: false,
          diagnosticsPromptOpen: false,
        }),

      chordSlotElement: null,
      bindChordSlot: (el: HTMLButtonElement | null) => set({ chordSlotElement: el }),

      diagnosticsPromptOpen: false,
      openDiagnosticsPrompt: () => set({ diagnosticsPromptOpen: true }),
      closeDiagnosticsPrompt: () => set({ diagnosticsPromptOpen: false }),
    }),
    {
      name: 'pr-extension-debug-storage',
      partialize: (state) => ({
        isDebugMode: state.isDebugMode,
      }),
    }
  )
);
