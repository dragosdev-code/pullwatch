import React, { useRef, useState } from 'react';
import { useTabs, type Tab, type UseTabsOptions } from './hook/use-tabs';
import { TabsContext } from './tabs-context';
import { TabIndicator } from './tab-indicator';
import { AnimatedTabButton } from './animated-tab-button';

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
  const tabsState = useTabs({ tabs, defaultTab, onChange });
  const { setActiveTab, isActive, activeTab } = tabsState;

  const [direction, setDirection] = useState<1 | -1>(1);
  const tabRefsMap = useRef<Map<string, HTMLButtonElement>>(new Map());

  const handleTabClick = (tabId: string, disabled?: boolean) => {
    if (!disabled) {
      const currentIndex = tabs.findIndex((t) => t.id === activeTab);
      const targetIndex = tabs.findIndex((t) => t.id === tabId);
      if (targetIndex !== currentIndex) {
        setDirection(targetIndex > currentIndex ? 1 : -1);
      }
      setActiveTab(tabId);
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
    <TabsContext.Provider value={{ activeTab: tabsState.activeTab, direction }}>
      <div className={`w-full overflow-hidden ${className}`}>
        {/* Tab Navigation */}
        <div
          role="tablist"
          className="tabs w-full relative border-b border-gray-200 justify-between flex"
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
    </TabsContext.Provider>
  );
};
