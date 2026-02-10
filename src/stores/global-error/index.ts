export { useGlobalErrorStore } from './store';
export type { GlobalErrorState } from './types';

// Selectors
import { useGlobalErrorStore } from './store';

export const useGlobalError = () => useGlobalErrorStore((state) => state.error);
export const useSetGlobalError = () => useGlobalErrorStore((state) => state.setError);
export const useClearGlobalError = () => useGlobalErrorStore((state) => state.clearError);
