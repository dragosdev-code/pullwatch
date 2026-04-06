import { animated, config, to, useSprings } from '@react-spring/web';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from '../../hooks/use-prefers-reduced-motion';

const LETTERS = Array.from('Pullwatch');
const LIFT_PX = 4;
const HOVER_SCALE = 1.04;

export interface NamedLogoProps {
  className?: string;
  /** Increment when the parent button fires `mouseleave` so padding/outside moves clear the active letter. */
  hoverResetKey?: number;
}

/**
 * "Pullwatch" with per-letter hover motion (react-spring).
 * Screen readers: parent should supply aria-label; this subtree is aria-hidden.
 */
export function NamedLogo({ className, hoverResetKey = 0 }: NamedLogoProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    setHoveredIndex(null);
  }, [hoverResetKey]);

  const [springs] = useSprings(
    LETTERS.length,
    (i) => ({
      y: reducedMotion ? 0 : hoveredIndex === i ? -LIFT_PX : 0,
      scale: reducedMotion ? 1 : hoveredIndex === i ? HOVER_SCALE : 1,
      config: config.gentle,
      immediate: reducedMotion,
    }),
    [hoveredIndex, reducedMotion]
  );

  return (
    <span className={clsx('inline-flex items-baseline select-none', className)} aria-hidden="true">
      {LETTERS.map((char, i) => {
        const s = springs[i];
        if (!s) return null;
        return (
          <animated.span
            key={`${char}-${i}`}
            className={clsx(
              'inline-block font-semibold text-[15px] tracking-tight text-base-content hover:text-primary will-change-transform',
              reducedMotion && 'opacity-90 transition-opacity duration-200 hover:opacity-100'
            )}
            style={
              reducedMotion
                ? undefined
                : {
                    transform: to([s.y, s.scale], (y, sc) => `translateY(${y}px) scale(${sc})`),
                  }
            }
            onMouseEnter={() => setHoveredIndex(i)}
          >
            {char}
          </animated.span>
        );
      })}
    </span>
  );
}
