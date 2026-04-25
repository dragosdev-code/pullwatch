import type { Tab, TabCreateProperties } from '../chrome-types';

export interface TabsAdapter {
  create(createProperties: TabCreateProperties): Promise<Tab>;
}

export function makeTabsAdapter(): TabsAdapter {
  return {
    create: (props) => chrome.tabs.create(props),
  };
}
