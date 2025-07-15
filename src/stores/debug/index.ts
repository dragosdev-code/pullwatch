export { useDebugStore } from './store';
export type { DebugState } from './types';

// Selectors
import { useDebugStore } from './store';

export const useDebugMode = () => useDebugStore((state) => state.isDebugMode);
export const useDebugPending = () => useDebugStore((state) => state.isDebugPending);
export const useDebugClickCount = () => useDebugStore((state) => state.clickCount);
export const useHandleGithubClick = () => useDebugStore((state) => state.handleGithubClick);
export const useResetDebugMode = () => useDebugStore((state) => state.resetDebugMode);
