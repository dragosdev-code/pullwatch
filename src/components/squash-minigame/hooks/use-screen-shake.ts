import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { useGameStore } from '../context/game-store-context';

export interface UseScreenShakeOptions {
  now?: () => number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

const defaultNow = () => performance.now();

/**
 * Returns `true` while the screen shake CSS animation should be applied. Listens to `shakeUntil`
 * via an atomic subscription, then schedules a timeout to flip the flag back off, so the CSS
 * animation can replay on the next miss or feature click.
 *
 * WHY [stable defaults]: hoisting the default `now`, `setTimeout`, and `clearTimeout` references
 * to module scope keeps the effect dependency array stable across renders so the timeout is not
 * recreated every render in production.
 */
export function useScreenShake(options: UseScreenShakeOptions = {}): boolean {
  const now = options.now ?? defaultNow;
  const setTimeoutFn = options.setTimeoutFn ?? setTimeout;
  const clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;

  const store = useGameStore();
  const shakeUntil = useStore(store, (s) => s.shakeUntil);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (shakeUntil === 0) {
      setActive(false);
      return;
    }
    const remaining = shakeUntil - now();
    if (remaining <= 0) {
      setActive(false);
      return;
    }
    setActive(true);
    const handle = setTimeoutFn(() => setActive(false), remaining);
    return () => clearTimeoutFn(handle);
  }, [shakeUntil, now, setTimeoutFn, clearTimeoutFn]);

  return active;
}
