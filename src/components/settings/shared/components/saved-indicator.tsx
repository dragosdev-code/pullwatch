import { useLayoutEffect, useRef, useState } from 'react';
import { animated, useSpring, useTransition } from '@react-spring/web';

export const SAVED_INDICATOR_ENTER_MS = 200;

interface SavedIndicatorProps {
  visible: boolean;
  flashId: number;
}

/** Subtle overshoot for scale / vertical settle (stroke draw stays linear in `p`). */
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}

const CHECK_PATH_D = 'm4.5 12.75 6 6 9-13.5';

/**
 * Remounts when `flashId` changes so stroke + entrance replay immediately on every save,
 * even while the row stays visible.
 */
function AnimatedCheckmark() {
  const pathRef = useRef<SVGPathElement | null>(null);
  const [pathLen, setPathLen] = useState(0);

  useLayoutEffect(() => {
    const el = pathRef.current;
    if (el) setPathLen(el.getTotalLength());
  }, []);

  const springs = useSpring({
    from: { p: 0 },
    to: { p: pathLen > 0 ? 1 : 0 },
    config: { duration: SAVED_INDICATOR_ENTER_MS, easing: (t: number) => t },
  });

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      className="size-4 text-green-600 shrink-0"
      aria-hidden
    >
      <animated.g
        style={{
          transformOrigin: '50% 50%',
          transform: springs.p.to((p) => {
            const back = easeOutBack(p);
            const dy = (1 - p) * 4;
            const sc = 0.88 + 0.12 * back;
            return `translateY(${dy}px) scale(${sc})`;
          }),
        }}
      >
        <animated.path
          ref={pathRef}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.5}
          stroke="currentColor"
          fill="none"
          d={CHECK_PATH_D}
          style={
            pathLen > 0
              ? {
                  strokeDasharray: pathLen,
                  strokeDashoffset: springs.p.to((p) => pathLen * (1 - p)),
                }
              : { opacity: 0 }
          }
        />
      </animated.g>
    </svg>
  );
}

export const SavedIndicator = ({ visible, flashId }: SavedIndicatorProps) => {
  const transitions = useTransition(visible, {
    from: { opacity: 0 },
    enter: { opacity: 1 },
    leave: { opacity: 0 },
    config: { duration: SAVED_INDICATOR_ENTER_MS },
  });

  return transitions((style, show) =>
    show ? (
      <animated.div
        style={style}
        className="flex items-center gap-1"
        role="status"
        aria-live="polite"
      >
        <AnimatedCheckmark key={flashId} />
        <span className="text-[11px] text-base-content/50">Saved</span>
      </animated.div>
    ) : null
  );
};
