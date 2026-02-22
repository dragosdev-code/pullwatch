import { create } from 'zustand';
import type { TabControlState } from './types';

export const useTabControlStore = create<TabControlState>((set, get) => ({
  activeTab: '',
  direction: 1,
  tabOrder: [],
  registerTabs: (tabIds: string[]) => set({ tabOrder: tabIds }),
  setActiveTab: (tabId: string) => {
    const { activeTab, tabOrder } = get();
    if (tabId === activeTab) return;
    const currentIdx = tabOrder.indexOf(activeTab);
    const targetIdx = tabOrder.indexOf(tabId);
    const direction: 1 | -1 =
      currentIdx === -1 || targetIdx === -1 || targetIdx > currentIdx ? 1 : -1;
    set({ activeTab: tabId, direction });
  },
  isActive: (tabId: string) => get().activeTab === tabId,
}));
