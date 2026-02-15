import React, { useRef, useState, useLayoutEffect } from 'react';
import { useTabs, type Tab, type UseTabsOptions } from './hook/use-tabs';
import { TabsContext } from './tabs-context';
import { AnimatedTabButton } from './animated-tab-button';

interface TabsProps extends Omit<UseTabsOptions, 'tabs'> {
  tabs: Tab[];
  children: React.ReactNode;
  className?: string;
}

const INDICATOR_TRANSITION =
  'left 300ms cubic-bezier(0.22, 0.61, 0.36, 1), width 300ms cubic-bezier(0.22, 0.61, 0.36, 1)';

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
  const tablistRef = useRef<HTMLDivElement>(null);
  const tabRefsMap = useRef<Map<string, HTMLButtonElement>>(new Map());
  const indicatorRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);

  // Reset on unmount so StrictMode re-mount snaps instead of animating
  useLayoutEffect(() => {
    return () => {
      hasInitialized.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    const tabEl = tabRefsMap.current.get(activeTab);
    const tablistEl = tablistRef.current;
    const indicatorEl = indicatorRef.current;
    if (!tabEl || !tablistEl || !indicatorEl) return;

    const left = tabEl.offsetLeft;
    const width = tabEl.offsetWidth;

    if (width === 0) return;

    if (!hasInitialized.current) {
      // First paint: set position synchronously without transition
      indicatorEl.style.transition = 'none';
      indicatorEl.style.left = `${left}px`;
      indicatorEl.style.width = `${width}px`;
      // Force reflow so the browser commits the no-transition styles
      void indicatorEl.offsetWidth;
      indicatorEl.style.transition = INDICATOR_TRANSITION;
      hasInitialized.current = true;
    } else {
      indicatorEl.style.left = `${left}px`;
      indicatorEl.style.width = `${width}px`;
    }
  }, [activeTab, tabs]);

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
          <div
            ref={indicatorRef}
            style={{
              position: 'absolute',
              bottom: -1,
              height: 4,
              left: 0,
              width: 0,
              backgroundColor: 'oklch(62.3% 0.214 259.815)',
              borderRadius: 9999,
              transition: INDICATOR_TRANSITION,
            }}
            aria-hidden
          />
        </div>

        {/* Tab Content */}
        <div className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
          {children}
        </div>
      </div>
    </TabsContext.Provider>
  );
};
