import { animated, useSpring } from '@react-spring/web';

const R = 5.5;
const DEFAULT_VIEW = 14;
const CX = DEFAULT_VIEW / 2;
const CY = DEFAULT_VIEW / 2;
const CIRC = 2 * Math.PI * R;

export interface DurationRadialRingProps {
  active: boolean;
  durationMs: number;
  viewSize?: number;
  className?: string;
}

export function DurationRadialRing({
  active,
  durationMs,
  viewSize = DEFAULT_VIEW,
  className = 'pointer-events-none shrink-0 -rotate-90 text-primary',
}: DurationRadialRingProps) {
  const ringSpring = useSpring({
    from: { strokeDashoffset: CIRC },
    strokeDashoffset: active ? 0 : CIRC,
    config: active ? { duration: durationMs, easing: (t: number) => t } : { duration: 0 },
  });

  return (
    <svg
      className={className}
      width={viewSize}
      height={viewSize}
      viewBox={`0 0 ${DEFAULT_VIEW} ${DEFAULT_VIEW}`}
      aria-hidden
    >
      <circle
        cx={CX}
        cy={CY}
        r={R}
        fill="none"
        className="stroke-base-300/70"
        strokeWidth={1.5}
      />
      <animated.circle
        cx={CX}
        cy={CY}
        r={R}
        fill="none"
        className="stroke-current"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeDasharray={CIRC}
        style={ringSpring}
      />
    </svg>
  );
}
