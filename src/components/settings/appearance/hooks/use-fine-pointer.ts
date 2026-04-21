import { useState } from 'react';

const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';

/**
 * Resolved once on mount — the popup has a fixed host environment (desktop
 * extension vs. mobile emulation) that won't change mid-session, so a live
 * listener would only add overhead.
 */
export const useFinePointer = (): boolean => {
  const [isFine] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.matchMedia(FINE_POINTER_QUERY).matches;
    } catch {
      return false;
    }
  });
  return isFine;
};
