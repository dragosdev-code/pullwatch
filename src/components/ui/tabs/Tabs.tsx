import React, { useRef, useLayoutEffect } from 'react';
import { useSpring, animated } from '@react-spring/web';
import { useTabs, type Tab, type UseTabsOptions } from './hook/use-tabs';
import { TabsContext } from './tab-panel';
import { AnimatedTabButton } from './animated-tab-button';

interface TabsProps extends Omit<UseTabsOptions, 'tabs'> {
  tabs: Tab[];
  children: React.ReactNode;
  className?: string;
}

const INDICATOR_CONFIG = { tension: 300, friction: 30 };

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  children,
  className = '',
  defaultTab,
  onChange,
}) => {
  const tabsState = useTabs({ tabs, defaultTab, onChange });
  const { setActiveTab, isActive, activeTab } = tabsState;

  const tablistRef = useRef<HTMLDivElement>(null);
  const tabRefsMap = useRef<Map<string, HTMLButtonElement>>(new Map());

  const [indicatorSpring, indicatorApi] = useSpring(() => ({
    left: 0,
    width: 0,
    config: INDICATOR_CONFIG,
  }));

  useLayoutEffect(() => {
    const tabEl = tabRefsMap.current.get(activeTab);
    const tablistEl = tablistRef.current;
    if (!tabEl || !tablistEl) return;

    const tabRect = tabEl.getBoundingClientRect();
    const tablistRect = tablistEl.getBoundingClientRect();
    const left = tabRect.left - tablistRect.left;
    const width = tabRect.width;

    indicatorApi.start({ left, width, config: INDICATOR_CONFIG });
  }, [activeTab, tabs, indicatorApi]);

  const handleTabClick = (tabId: string, disabled?: boolean) => {
    if (!disabled) {
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
    <TabsContext.Provider value={{ activeTab: tabsState.activeTab }}>
      <div className={`w-full overflow-hidden ${className}`}>
        {/* Tab Navigation */}
        <div
          ref={tablistRef}
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
          <animated.div
            style={{
              ...indicatorSpring,
              position: 'absolute',
              bottom: -1,
              height: 4,
              backgroundColor: 'oklch(62.3% 0.214 259.815)',
              borderRadius: 9999,
            }}
            aria-hidden
          />
        </div>

        {/* Tab Content */}
        <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      </div>
    </TabsContext.Provider>
  );
};
