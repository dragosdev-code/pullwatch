import { createContext } from 'react';

/** Shape of the value provided to all TabPanel descendants. */
export interface TabsContextValue {
  activeTab: string;
  direction: 1 | -1; // 1 = rightward, -1 = leftward
}

export const TabsContext = createContext<TabsContextValue | null>(null);
