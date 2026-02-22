import { create } from 'zustand';
import type { TabControlState } from './types';

export const useTabControlStore = create<TabControlState>((set, get) => ({
  activeTab: '',
  setActiveTab: (tabId: string) => set({ activeTab: tabId }),
  isActive: (tabId: string) => get().activeTab === tabId,
}));
