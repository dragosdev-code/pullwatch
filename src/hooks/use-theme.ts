import { useCallback, useEffect, useRef, useState } from 'react';
import { isExtensionContext } from '../utils/is-extension-context';
import { runThemeRipple } from '../lib/theme-ripple';
import { chromeExtensionService } from '@common/chrome-extension-service';

const STORAGE_KEY = 'pr-extension-theme';
const DEFAULT_THEME = 'light';

export const useTheme = () => {
  const [theme, setThemeState] = useState<string>(DEFAULT_THEME);
  const [isThemeLoaded, setIsThemeLoaded] = useState(false);
  // Mirrors `theme` — lets setTheme stay identity-stable (empty deps) so memoized
  // child rows don't invalidate on every swap. Updated eagerly inside setTheme
  // so rapid-fire calls see the pending value, not a stale render snapshot.
  const themeRef = useRef(theme);

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const savedRecord = isExtensionContext()
          ? await chromeExtensionService.storage.sync.get(STORAGE_KEY)
          : null;
        const saved = savedRecord?.[STORAGE_KEY];
        const resolved = typeof saved === 'string' && saved ? saved : DEFAULT_THEME;
        themeRef.current = resolved;
        setThemeState(resolved);
        document.documentElement.setAttribute('data-theme', resolved);
        localStorage.setItem(STORAGE_KEY, resolved);
      } catch {
        document.documentElement.setAttribute('data-theme', DEFAULT_THEME);
      } finally {
        setIsThemeLoaded(true);
      }
    };
    loadTheme();
  }, []);

  const setTheme = useCallback(
    async (newTheme: string, origin?: { x: number; y: number }) => {
      if (newTheme === themeRef.current) return;
      themeRef.current = newTheme;

      // No flushSync: React commits the state update asynchronously while the VT
      // animation is in flight (620ms gives it plenty of headroom). flushSync
      // here blocked the main thread 5–20ms per click and compounded on rapid
      // spam-clicks — visible as "lag" before the ripple started.
      const apply = () => {
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem(STORAGE_KEY, newTheme);
        setThemeState(newTheme);
      };

      if (origin) {
        runThemeRipple(origin, apply);
      } else {
        apply();
      }

      try {
        if (isExtensionContext()) {
          await chromeExtensionService.storage.sync.set({ [STORAGE_KEY]: newTheme });
        }
      } catch {
        console.warn('Failed to persist theme to Chrome storage');
      }
    },
    []
  );

  return { theme, setTheme, isThemeLoaded };
};
