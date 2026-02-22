import React, { useEffect, useMemo, useRef } from 'react';
import { TabIndicator } from './tab-indicator';
import { AnimatedTabButton } from './animated-tab-button';
import { useTabControlStore } from '../../../stores/tab-control/store';
import type { Tab, UseTabsOptions } from './types';

interface TabsProps extends Omit<UseTabsOptions, 'tabs'> {
  tabs: Tab[];
  children: React.ReactNode;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  children,
  className = '',
  defaultTab,
  onChange,
}) => {
  const activeTab = useTabControlStore((state) => state.activeTab);
  const setActiveTab = useTabControlStore((state) => state.setActiveTab);
  const registerTabs = useTabControlStore((state) => state.registerTabs);

  const isActive = (tabId: string) => activeTab === tabId;

  const tabIds = useMemo(() => tabs.map((t) => t.id), [tabs]);

  useEffect(() => {
    registerTabs(tabIds);
  }, [tabIds, registerTabs]);

  useEffect(() => {
    if (defaultTab && !activeTab) {
      setActiveTab(defaultTab);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabRefsMap = useRef<Map<string, HTMLButtonElement>>(new Map());

  const handleTabClick = (tabId: string, disabled?: boolean) => {
    if (!disabled && tabId !== activeTab) {
      setActiveTab(tabId);
      onChange?.(tabId);
    }
  };

  const setTabRef = (id: string) => (el: HTMLButtonElement | null) => {
    if (el) {
      tabRefsMap.current.set(id, el);
    } else {
      tabRefsMap.current.delete(id);
    }
  };

  return (
    <div className={`w-full overflow-hidden ${className}`}>
      {/* Tab Navigation */}
      <div
        role="tablist"
        className="tabs w-full relative border-b border-base-300 justify-between flex"
      >
        {tabs.map((tab) => (
          <AnimatedTabButton
            key={tab.id}
            tab={tab}
            isActive={isActive(tab.id)}
            onClick={() => handleTabClick(tab.id, tab.disabled)}
            disabled={tab.disabled}
            buttonRef={setTabRef(tab.id)}
          />
        ))}
        <TabIndicator activeTab={activeTab} tabs={tabs} tabRefsMap={tabRefsMap} />
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 flex flex-col relative overflow-hidden">{children}</div>
    </div>
  );
};
