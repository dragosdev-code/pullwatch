import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '@src/hooks/use-prefers-reduced-motion';
import { TAB_INDICATOR_TRANSITION } from '../tabs/tabs-config';

const PILL_TRANSITION = `${TAB_INDICATOR_TRANSITION}, transform 220ms cubic-bezier(0.22, 1.4, 0.36, 1)`;
const PRESS_SCALE = 0.86;
const PRESS_DURATION_MS = 130;

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

interface SegmentedControlProps<T extends string> {
  /** Header label rendered above the track. */
  label: string;
  /** Optional subtitle rendered under the header label. */
  hint?: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * Sliding-pill segmented control. The pill snaps on mount and on container resize (so
 * popup-shell preset changes don't leave the pill mis-sized), and slides on user selection.
 */
export const SegmentedControl = <T extends string>({
  label,
  hint,
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) => {
  const prefersReducedMotion = usePrefersReducedMotion();

  const trackRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  /** First measurement must snap the pill into place instead of sliding in from 0. */
  const hasInitialized = useRef(false);
  const pressTimeoutRef = useRef<number | null>(null);

  const handleSelect = useCallback(
    (next: T) => {
      const pill = pillRef.current;
      if (pill && !prefersReducedMotion) {
        if (pressTimeoutRef.current !== null) {
          window.clearTimeout(pressTimeoutRef.current);
        }
        pill.style.transform = `scale(${PRESS_SCALE})`;
        pressTimeoutRef.current = window.setTimeout(() => {
          if (pillRef.current) {
            pillRef.current.style.transform = 'scale(1)';
          }
          pressTimeoutRef.current = null;
        }, PRESS_DURATION_MS);
      }
      onChange(next);
    },
    [onChange, prefersReducedMotion]
  );

  useLayoutEffect(() => {
    return () => {
      hasInitialized.current = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (pressTimeoutRef.current !== null) {
        window.clearTimeout(pressTimeoutRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    /** snap=true for layout-driven remeasures (mount, container resize) to avoid a slide that
     *  looks like an unintended animation; false for user-driven value changes where we slide. */
    const syncPill = (snap: boolean) => {
      const activeIndex = options.findIndex((option) => option.value === value);
      const activeButton = buttonRefs.current[activeIndex];
      const pill = pillRef.current;
      if (!activeButton || !pill) return;

      const left = activeButton.offsetLeft;
      const width = activeButton.offsetWidth;
      if (width === 0) return;

      if (snap || !hasInitialized.current || prefersReducedMotion) {
        pill.style.transition = 'none';
        pill.style.left = `${left}px`;
        pill.style.width = `${width}px`;
        void pill.offsetWidth;
        pill.style.transition = prefersReducedMotion ? 'none' : PILL_TRANSITION;
        hasInitialized.current = true;
      } else {
        pill.style.left = `${left}px`;
        pill.style.width = `${width}px`;
      }
    };

    syncPill(false);
    const observer = new ResizeObserver(() => syncPill(true));
    observer.observe(track);
    return () => observer.disconnect();
  }, [value, options, prefersReducedMotion]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col">
        <span className="text-sm font-medium text-base-content">{label}</span>
        {hint ? <span className="text-xs text-base-content/50">{hint}</span> : null}
      </div>

      <div ref={trackRef} className="relative flex gap-1 p-1 bg-base-200 rounded-lg">
        <div
          ref={pillRef}
          aria-hidden
          className="absolute top-1 bottom-1 rounded-md bg-base-100 shadow-sm pointer-events-none"
          style={{
            left: 0,
            width: 0,
            transformOrigin: 'center',
            transition: PILL_TRANSITION,
          }}
        />
        {options.map((option, index) => {
          const isSelected = value === option.value;
          return (
            <button
              key={option.value}
              ref={(el) => {
                buttonRefs.current[index] = el;
              }}
              type="button"
              onClick={() => handleSelect(option.value)}
              className={`relative z-10 flex-1 flex flex-col items-center gap-0.5 px-3 py-2 rounded-md text-sm cursor-pointer transition-colors duration-150 ${
                isSelected
                  ? 'text-base-content'
                  : 'text-base-content/60 hover:text-base-content'
              }`}
              aria-pressed={isSelected}
            >
              <span className="font-medium leading-tight">{option.label}</span>
              {option.description ? (
                <span
                  className={`text-[11px] leading-tight transition-colors duration-150 ${
                    isSelected ? 'text-base-content/60' : 'text-base-content/40'
                  }`}
                >
                  {option.description}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
};
