import { animated, config, to, useSprings } from '@react-spring/web';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from '../../hooks/use-prefers-reduced-motion';

const LETTERS = Array.from('Pullwatch');

/**
 * DaisyUI semantic colors for each letter when that letter alone is hovered (`text-base-content` otherwise).
 * Order echoes the app icon gradient (lavender → pink → warm → mint → blue → neutral).
 */
const LETTER_HOVER_TEXT_CLASSES = [
  'text-primary',
  'text-secondary',
  'text-warning',
  'text-info',
  'text-error/90',
  'text-accent',
  'text-success',
  'text-warning',
  'text-secondary/80',
] as const;

const LIFT_PX = 4;
const HOVER_SCALE = 1.04;

export interface NamedLogoProps {
  /** Merged onto the wrapping `button` (hit area and layout). */
  className?: string;
}

/**
 * "Pullwatch" as a `button`: default `text-base-content`; each letter shows its pastel DaisyUI color only while hovered.
 * Per-letter hover motion via react-spring. Leaving the button clears the active letter state.
 */
export function NamedLogo({ className }: NamedLogoProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [hoverResetKey, setHoverResetKey] = useState(0);

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
    <button
      type="button"
      onMouseLeave={() => setHoverResetKey((k) => k + 1)}
      className={clsx(
        'text-left rounded-md -my-0.5 -mx-1 px-1 py-0.5 transition-colors duration-200',
        className
      )}
    >
      <span className="inline-flex items-baseline select-none">
        {LETTERS.map((char, i) => {
          const s = springs[i];
          if (!s) return null;
          return (
            <animated.span
              key={`${char}-${i}`}
              className={clsx(
                'inline-block will-change-transform',
                !reducedMotion && 'hover:brightness-110 dark:hover:brightness-125'
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
              <span
                className={clsx(
                  'font-semibold text-[15px] tracking-tight duration-300 ease-out',
                  hoveredIndex === i ? LETTER_HOVER_TEXT_CLASSES[i] : 'text-base-content',
                  reducedMotion
                    ? 'opacity-90 transition-[color,opacity] hover:opacity-100'
                    : 'transition-colors'
                )}
              >
                {char}
              </span>
            </animated.span>
          );
        })}
      </span>
    </button>
  );
}
