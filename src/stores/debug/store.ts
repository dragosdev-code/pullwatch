import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DebugState {
  isDebugMode: boolean;
  clickCount: number;
  isDebugPending: boolean;
  handleGithubClick: () => void;
  resetDebugMode: () => void;
}

export const useDebugStore = create<DebugState>()(
  persist(
    (set, get) => ({
      isDebugMode: false,
      clickCount: 0,
      isDebugPending: false,

      handleGithubClick: () => {
        const { clickCount, isDebugMode } = get();
        const newClickCount = clickCount + 1;

        if (newClickCount === 4) {
          // 4th click - show pending state
          set({ clickCount: newClickCount, isDebugPending: true });
          console.log('🔧 Debug mode pending - click once more to activate');
        } else if (newClickCount === 5) {
          // 5th click - activate debug mode
          set({ isDebugMode: true, isDebugPending: false, clickCount: 0 });
          console.log('🚀 Debug mode activated!');
        } else if (newClickCount === 1 && isDebugMode) {
          // 1st click when debug is active - deactivate debug mode
          set({ isDebugMode: false, isDebugPending: false, clickCount: 0 });
          console.log('🔒 Debug mode deactivated');
        } else if (newClickCount >= 6) {
          // Reset if too many clicks without activating
          set({ clickCount: 0, isDebugPending: false });
        } else {
          set({ clickCount: newClickCount });
        }

        // Auto-reset click count after 3 seconds of inactivity
        setTimeout(() => {
          const currentState = get();
          if (currentState.clickCount === newClickCount) {
            set({ clickCount: 0, isDebugPending: false });
          }
        }, 3000);
      },

      resetDebugMode: () =>
        set({
          isDebugMode: false,
          isDebugPending: false,
          clickCount: 0,
        }),
    }),
    {
      name: 'pr-extension-debug-storage',
      partialize: (state) => ({
        isDebugMode: state.isDebugMode,
      }),
    }
  )
);
