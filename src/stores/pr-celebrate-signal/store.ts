import { create } from 'zustand';

export type PrCelebrateSignalState = {
  /** Monotonic counter; bumps when assigned/merged gain a new `isNew` id (see sync hook). */
  signal: number;
  bump: () => void;
};

export const usePrCelebrateSignalStore = create<PrCelebrateSignalState>((set) => ({
  signal: 0,
  bump: () => set((s) => ({ signal: s.signal + 1 })),
}));
