import type { ReactNode } from 'react';
import { useEffect, useLayoutEffect, useState } from 'react';
import clsx from 'clsx';
import { usePrefersReducedMotion } from '../../../../hooks/use-prefers-reduced-motion';
import { SETTINGS_EASE_OUT_EXPO } from '../animation/settings-motion';

type SettingsNoticeTransitionProps = {
  visible: boolean;
  children: ReactNode;
  className?: string;
  role?: 'status' | 'alert';
};

/** One duration + easing for row + inner opacity so exit does not “stagger”. */
const NOTICE_MS = 148;

const noticeMotion = {
  transitionDuration: `${NOTICE_MS}ms`,
  transitionTimingFunction: SETTINGS_EASE_OUT_EXPO,
} as const;

/**
 * Inline settings callouts: `grid-template-rows` 0fr/1fr handles vertical space; inner layer fades
 * with the same duration/easing (inner: opacity only so it never fights the row collapse).
 * Enter: paint collapsed first, then flip `enterReady` (double rAF) so CSS transitions actually run
 * instead of jumping straight to the expanded end state.
 * Unmounts after close. Timeout (not `transitionend`) keeps JSDOM/tests deterministic.
 */
export const SettingsNoticeTransition = ({
  visible,
  children,
  className,
  role = 'status',
}: SettingsNoticeTransitionProps) => {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [inDom, setInDom] = useState(visible);
  /** False for one frame pair after open so "from" row/opacity are committed before expanding. */
  const [enterReady, setEnterReady] = useState(false);

  const expanded = visible && enterReady;

  useLayoutEffect(() => {
    if (visible) setInDom(true);
  }, [visible]);

  useLayoutEffect(() => {
    if (!visible || !inDom) {
      setEnterReady(false);
      return;
    }
    setEnterReady(false);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setEnterReady(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [visible, inDom]);

  useEffect(() => {
    if (visible) return;
    const id = window.setTimeout(() => setInDom(false), NOTICE_MS);
    return () => window.clearTimeout(id);
  }, [visible]);

  if (prefersReducedMotion) {
    return visible ? (
      <div role={role} className={className}>
        {children}
      </div>
    ) : null;
  }

  if (!inDom) return null;

  return (
    <div
      className={clsx(
        'grid overflow-hidden motion-reduce:transition-none',
        expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      )}
      style={{ ...noticeMotion, transitionProperty: 'grid-template-rows' }}
    >
      <div className="min-h-0 overflow-hidden contain-[layout]">
        <div
          role={role}
          className={clsx(
            className,
            'motion-reduce:transition-none',
            expanded ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}
          style={{
            ...noticeMotion,
            transitionProperty: 'opacity',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};
