import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { TOOLTIP_SHOW_DELAY_MS } from '../constants';

export const useDelayedTooltip = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const showTimerRef = useRef<number | null>(null);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const policyId = useId().replace(/:/g, '');

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current !== null) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  }, []);

  const scheduleTooltipOpen = useCallback(() => {
    clearShowTimer();
    const id = window.setTimeout(() => {
      showTimerRef.current = null;
      setTooltipOpen(true);
    }, TOOLTIP_SHOW_DELAY_MS);
    showTimerRef.current = id;
  }, [clearShowTimer]);

  const closeTooltipImmediately = useCallback(() => {
    clearShowTimer();
    setTooltipOpen(false);
  }, [clearShowTimer]);

  useEffect(() => () => clearShowTimer(), [clearShowTimer]);

  const handleContainerBlur = useCallback(
    (e: React.FocusEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
        closeTooltipImmediately();
      }
    },
    [closeTooltipImmediately]
  );

  return {
    containerRef,
    tooltipOpen,
    policyId,
    scheduleTooltipOpen,
    closeTooltipImmediately,
    handleContainerBlur,
  };
};
