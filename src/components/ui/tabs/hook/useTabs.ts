import { useState, useCallback, useMemo } from 'react';

export interface Tab {
  id: string;
  label: string;
  count?: number;
  disabled?: boolean;
}

export interface UseTabsOptions {
  defaultTab?: string;
  tabs: Tab[];
  onChange?: (tabId: string) => void;
}

export interface UseTabsReturn {
  activeTab: string;
  setActiveTab: (tabId: string) => void;
  isActive: (tabId: string) => boolean;
  getTabById: (tabId: string) => Tab | undefined;
  enabledTabs: Tab[];
  disabledTabs: Tab[];
  nextTab: () => void;
  previousTab: () => void;
  canGoNext: boolean;
  canGoPrevious: boolean;
  activeTabIndex: number;
  totalTabs: number;
}

export const useTabs = ({ defaultTab, tabs, onChange }: UseTabsOptions): UseTabsReturn => {
  // Initialize with first tab if no default provided
  const initialTab = defaultTab || tabs[0]?.id || '';
  const [activeTab, setActiveTabState] = useState<string>(initialTab);

  // Memoized enabled tabs list
  const enabledTabs = useMemo(() => tabs.filter((tab) => !tab.disabled), [tabs]);

  // Memoized disabled tabs list
  const disabledTabs = useMemo(() => tabs.filter((tab) => tab.disabled), [tabs]);

  // Get current active tab index in enabled tabs
  const activeTabIndex = useMemo(
    () => enabledTabs.findIndex((tab) => tab.id === activeTab),
    [enabledTabs, activeTab]
  );

  // Navigation state
  const canGoNext = useMemo(
    () => activeTabIndex < enabledTabs.length - 1,
    [activeTabIndex, enabledTabs.length]
  );

  const canGoPrevious = useMemo(() => activeTabIndex > 0, [activeTabIndex]);

  // Set active tab with validation
  const setActiveTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);

      // Don't switch to disabled tabs
      if (tab && !tab.disabled) {
        setActiveTabState(tabId);
        onChange?.(tabId);
      }
    },
    [tabs, onChange]
  );

  // Check if a tab is active
  const isActive = useCallback((tabId: string) => activeTab === tabId, [activeTab]);

  // Get tab by ID
  const getTabById = useCallback((tabId: string) => tabs.find((tab) => tab.id === tabId), [tabs]);

  // Navigate to next enabled tab
  const nextTab = useCallback(() => {
    if (canGoNext) {
      const nextTabId = enabledTabs[activeTabIndex + 1]?.id;
      if (nextTabId) {
        setActiveTab(nextTabId);
      }
    }
  }, [canGoNext, enabledTabs, activeTabIndex, setActiveTab]);

  // Navigate to previous enabled tab
  const previousTab = useCallback(() => {
    if (canGoPrevious) {
      const previousTabId = enabledTabs[activeTabIndex - 1]?.id;
      if (previousTabId) {
        setActiveTab(previousTabId);
      }
    }
  }, [canGoPrevious, enabledTabs, activeTabIndex, setActiveTab]);

  return {
    activeTab,
    setActiveTab,
    isActive,
    getTabById,
    enabledTabs,
    disabledTabs,
    nextTab,
    previousTab,
    canGoNext,
    canGoPrevious,
    activeTabIndex,
    totalTabs: tabs.length,
  };
};
