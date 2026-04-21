import { useCallback, useEffect, useRef } from 'react';

const HYDRATION_CENTER_DELAY_MS = 50;

interface UseThemeListScrollOptions {
  activeTheme: string;
  ready: boolean;
}

interface ThemeListScroll {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  registerItem: (name: string, el: HTMLButtonElement | null) => void;
  scrollToTheme: (name: string, smooth?: boolean) => void;
}

/**
 * Owns the scrollable container ref, the per-row button registry, and the
 * vertical-center scroll math. The one-shot auto-center waits on `ready` —
 * without the guard it would lock onto the default theme before storage
 * hydration resolves and never re-center on the real value.
 */
export const useThemeListScroll = ({
  activeTheme,
  ready,
}: UseThemeListScrollOptions): ThemeListScroll => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const hasCenteredRef = useRef(false);

  const scrollToTheme = useCallback((name: string, smooth = true) => {
    const container = scrollRef.current;
    const item = itemRefs.current.get(name);
    if (!container || !item) return;

    const containerRect = container.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const currentOffset = itemRect.top - containerRect.top;
    const centeredOffset = (container.clientHeight - item.offsetHeight) / 2;

    container.scrollTo({
      top: container.scrollTop + currentOffset - centeredOffset,
      behavior: smooth ? 'smooth' : 'instant',
    });
  }, []);

  const registerItem = useCallback((name: string, el: HTMLButtonElement | null) => {
    if (el) itemRefs.current.set(name, el);
    else itemRefs.current.delete(name);
  }, []);

  useEffect(() => {
    if (!ready || hasCenteredRef.current) return;
    hasCenteredRef.current = true;
    const timer = setTimeout(
      () => scrollToTheme(activeTheme, false),
      HYDRATION_CENTER_DELAY_MS
    );
    return () => clearTimeout(timer);
  }, [activeTheme, ready, scrollToTheme]);

  return { scrollRef, registerItem, scrollToTheme };
};
