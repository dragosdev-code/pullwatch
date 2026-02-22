export interface TabControlState {
  activeTab: string;
  direction: 1 | -1;
  tabOrder: string[];
  registerTabs: (tabIds: string[]) => void;
  setActiveTab: (tabId: string) => void;
  isActive: (tabId: string) => boolean;
}
