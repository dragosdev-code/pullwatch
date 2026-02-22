export { useTabControlStore } from './store';
export type { TabControlState } from './types';

// Selectors
import { useTabControlStore } from './store';

export const useActiveTab = () => useTabControlStore((state) => state.activeTab);
export const useDirection = () => useTabControlStore((state) => state.direction);
export const useSetActiveTab = () => useTabControlStore((state) => state.setActiveTab);
export const useRegisterTabs = () => useTabControlStore((state) => state.registerTabs);
export const useIsTabActive = () => useTabControlStore((state) => state.isActive);
