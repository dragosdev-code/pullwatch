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
/** Per-letter delay for the “new PR” sweep; short enough to read as one gesture, long enough to register each step. */
const CELEBRATE_MS_PER_LETTER = 72;

/**
 * Out-and-back sweep: forward 0..n-1, then n-1..0.
 * **Why n-1 appears twice in a row:** the return leg is defined from the end; re-firing the last index
 * holds the peak one beat before the wave walks back to the first letter, then we clear.
 */
const celebrateLetterSequence = (): number[] => {
  const n = LETTERS.length;
  const forward = Array.from({ length: n }, (_, i) => i);
  const backward = Array.from({ length: n }, (_, k) => n - 1 - k);
  return [...forward, ...backward];
};
/** How long all letters stay in hover colors during reduced-motion celebration (no staggered motion). */
const CELEBRATE_REDUCED_MOTION_MS = 420;

export type NamedLogoProps = {
  /**
   * Increments when the parent detects a new `isNew` PR in assigned/merged data; each bump runs one celebration pass.
   * **Why a counter:** the same number of new PRs could produce the same key twice across unrelated updates; monotonic bumps give a reliable effect dependency.
   */
  celebrateSignal?: number;
};

/**
 * "Pullwatch" wordmark: default `text-base-content`; each letter shows its pastel DaisyUI color only while hovered.
 * Per-letter hover motion via react-spring. Leaving the wrapper clears the active letter state.
 */
export const NamedLogo = ({ celebrateSignal = 0 }: NamedLogoProps) => {
  const reducedMotion = usePrefersReducedMotion();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [hoverResetKey, setHoverResetKey] = useState(0);
  const [celebrationIndex, setCelebrationIndex] = useState<number | null>(null);
  /** **Why:** reduced-motion users skip staggered transform motion; a simultaneous color pulse conveys the same “something happened” cue without vestibular load. */
  const [celebrateAllColors, setCelebrateAllColors] = useState(false);

  useEffect(() => {
    setHoveredIndex(null);
  }, [hoverResetKey]);

  const activeIndex = celebrationIndex ?? hoveredIndex;

  useEffect(() => {
    if (celebrateSignal === 0) {
      return;
    }

    let cancelled = false;
    const timeoutIds: ReturnType<typeof setTimeout>[] = [];

    if (reducedMotion) {
      setCelebrateAllColors(true);
      timeoutIds.push(
        setTimeout(() => {
          if (!cancelled) {
            setCelebrateAllColors(false);
          }
        }, CELEBRATE_REDUCED_MOTION_MS)
      );
    } else {
      let delay = 0;
      for (const letterIndex of celebrateLetterSequence()) {
        timeoutIds.push(
          setTimeout(() => {
            if (!cancelled) {
              setCelebrationIndex(letterIndex);
            }
          }, delay)
        );
        delay += CELEBRATE_MS_PER_LETTER;
      }
      timeoutIds.push(
        setTimeout(() => {
          if (!cancelled) {
            setCelebrationIndex(null);
          }
        }, delay)
      );
    }

    return () => {
      cancelled = true;
      timeoutIds.forEach(clearTimeout);
      setCelebrationIndex(null);
      setCelebrateAllColors(false);
    };
  }, [celebrateSignal, reducedMotion]);

  const [springs] = useSprings(
    LETTERS.length,
    (i) => ({
      y: reducedMotion ? 0 : activeIndex === i ? -LIFT_PX : 0,
      scale: reducedMotion ? 1 : activeIndex === i ? HOVER_SCALE : 1,
      config: config.gentle,
      immediate: reducedMotion,
    }),
    [activeIndex, reducedMotion]
  );

  return (
    <div
      onMouseLeave={() => setHoverResetKey((k) => k + 1)}
      className="inline-block text-left rounded-md -my-0.5 -mx-1 px-1 py-0.5 transition-colors duration-200"
    >
      <span className="inline-flex items-baseline select-none">
        {LETTERS.map((char, i) => {
          const s = springs[i];
          if (!s) return null;
          const showHoverColor = celebrateAllColors || activeIndex === i;
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
                  showHoverColor ? LETTER_HOVER_TEXT_CLASSES[i] : 'text-base-content',
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
    </div>
  );
};
