import React, { useContext, createContext } from 'react';

// Context to share the active tab between Tabs and TabPanel
interface TabsContextValue {
  activeTab: string;
}

export const TabsContext = createContext<TabsContextValue | null>(null);

interface TabPanelProps {
  tabId: string;
  children: React.ReactNode;
  className?: string;
}

export const TabPanel: React.FC<TabPanelProps> = ({ tabId, children, className = '' }) => {
  const context = useContext(TabsContext);

  // If no context, assume we're checking against a direct prop or fallback
  const isActive = context ? context.activeTab === tabId : false;

  if (!isActive) {
    return null;
  }

  return (
    <div
      role="tabpanel"
      id={`tabpanel-${tabId}`}
      aria-labelledby={`tab-${tabId}`}
      className={`outline-none flex flex-col ${className}`}
      tabIndex={0}
    >
      {children}
    </div>
  );
};
