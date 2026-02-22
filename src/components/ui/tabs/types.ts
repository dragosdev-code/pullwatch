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
