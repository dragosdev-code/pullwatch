import React from 'react';
import { useTabs, type Tab, type UseTabsOptions } from './hook/useTabs';
import { TabsContext } from './TabPanel';

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
  const { setActiveTab, isActive } = tabsState;

  const handleTabClick = (tabId: string, disabled?: boolean) => {
    if (!disabled) {
      setActiveTab(tabId);
    }
  };

  return (
    <TabsContext.Provider value={{ activeTab: tabsState.activeTab }}>
      <div className={`w-full overflow-hidden ${className}`}>
        {/* Tab Navigation */}
        <div role="tablist" className="tabs tabs-border w-full">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              className={`tab flex-1 text-xs font-medium transition-all duration-200 ${
                isActive(tab.id)
                  ? 'tab-active text-gray-900! hover:text-gray-900!'
                  : 'text-gray-500! hover:text-gray-900!'
              } ${tab.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              onClick={() => handleTabClick(tab.id, tab.disabled)}
              disabled={tab.disabled}
              aria-selected={isActive(tab.id)}
              aria-controls={`tabpanel-${tab.id}`}
              id={`tab-${tab.id}`}
            >
              <span className="flex items-center gap-1.5">
                {tab.label}
                {tab.count !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full min-w-[18px] text-center ${
                      isActive(tab.id) ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      </div>
    </TabsContext.Provider>
  );
};
