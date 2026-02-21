import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'pr-extension-theme';
const DEFAULT_THEME = 'light';

export const useTheme = () => {
  const [theme, setThemeState] = useState<string>(DEFAULT_THEME);

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const saved =
          typeof chrome !== 'undefined' && chrome.storage
            ? (await chrome.storage.sync.get(STORAGE_KEY))[STORAGE_KEY]
            : null;
        const resolved = saved || DEFAULT_THEME;
        setThemeState(resolved);
        document.documentElement.setAttribute('data-theme', resolved);
      } catch {
        document.documentElement.setAttribute('data-theme', DEFAULT_THEME);
      }
    };
    loadTheme();
  }, []);

  const setTheme = useCallback(async (newTheme: string) => {
    setThemeState(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        await chrome.storage.sync.set({ [STORAGE_KEY]: newTheme });
      }
    } catch {
      console.warn('Failed to persist theme to Chrome storage');
    }
  }, []);

  return { theme, setTheme };
};
