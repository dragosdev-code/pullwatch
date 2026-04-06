export { useDebugStore } from './store';
export type { DebugState } from './types';

import { useDebugStore } from './store';

export const useDebugMode = () => useDebugStore((state) => state.isDebugMode);
export const useSetDebugMode = () => useDebugStore((state) => state.setDebugMode);
export const useResetDebugMode = () => useDebugStore((state) => state.resetDebugMode);
