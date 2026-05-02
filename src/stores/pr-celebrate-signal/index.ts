import { usePrCelebrateSignalStore } from './store';

export { usePrCelebrateSignalStore } from './store';
export type { PrCelebrateSignalState } from './store';

/** Subscribe to the shared “new isNew PR” celebration counter (driven by {@link useSyncPrCelebrateSignal}). */
export const usePrCelebrateSignal = (): number =>
  usePrCelebrateSignalStore((state) => state.signal);
