import React, { useRef, useLayoutEffect } from 'react';
import { TAB_INDICATOR_TRANSITION } from './tabs-config';

interface TabIndicatorProps {
  activeTab: string;
  tabs: { id: string }[];
  tabRefsMap: React.RefObject<Map<string, HTMLButtonElement>>;
}

export const TabIndicator: React.FC<TabIndicatorProps> = ({
  activeTab,
  tabs,
  tabRefsMap,
}) => {
  const indicatorRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);

  useLayoutEffect(() => {
    return () => {
      hasInitialized.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    const tabEl = tabRefsMap.current?.get(activeTab);
    const indicatorEl = indicatorRef.current;
    if (!tabEl || !indicatorEl) return;

    const left = tabEl.offsetLeft;
    const width = tabEl.offsetWidth;
    if (width === 0) return;

    if (!hasInitialized.current) {
      indicatorEl.style.transition = 'none';
      indicatorEl.style.left = `${left}px`;
      indicatorEl.style.width = `${width}px`;
      void indicatorEl.offsetWidth;
      indicatorEl.style.transition = TAB_INDICATOR_TRANSITION;
      hasInitialized.current = true;
    } else {
      indicatorEl.style.left = `${left}px`;
      indicatorEl.style.width = `${width}px`;
    }
  }, [activeTab, tabs, tabRefsMap]);

  return (
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
        transition: TAB_INDICATOR_TRANSITION,
      }}
      aria-hidden
    />
  );
};
