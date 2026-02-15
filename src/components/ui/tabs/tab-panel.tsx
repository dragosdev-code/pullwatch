import React, { useContext } from 'react';
import { useTransition, animated } from '@react-spring/web';
import { TabsContext } from './tabs-context';
import { TAB_SPRING_CONFIG } from './tabs-config';

interface TabPanelProps {
  tabId: string;
  children: React.ReactNode;
  className?: string;
}

export const TabPanel: React.FC<TabPanelProps> = ({ tabId, children, className = '' }) => {
  const context = useContext(TabsContext);
  const isActive = context ? context.activeTab === tabId : false;
  const direction = context ? context.direction : 1;

  const transitions = useTransition(isActive, {
    initial: { opacity: 1, transform: 'translateX(0px)' },
    from: { opacity: 0, transform: `translateX(${-direction * 100}px)` },
    enter: { opacity: 1, transform: 'translateX(0px)' },
    leave: { opacity: 0, transform: `translateX(${direction * 100}px)` },
    config: TAB_SPRING_CONFIG,
    exitBeforeEnter: false,
  });

  return transitions((style, show) =>
    show ? (
      <animated.div
        role="tabpanel"
        id={`tabpanel-${tabId}`}
        aria-labelledby={`tab-${tabId}`}
        className={`outline-none flex flex-col w-full ${className}`}
        tabIndex={0}
        style={{
          ...style,
          position: isActive ? 'relative' : 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: isActive ? 'auto' : '100%',
          pointerEvents: isActive ? 'auto' : 'none',
          visibility: style.opacity.to((o) => (o < 0.01 ? 'hidden' : 'visible')),
        }}
      >
        {children}
      </animated.div>
    ) : null
  );
};
