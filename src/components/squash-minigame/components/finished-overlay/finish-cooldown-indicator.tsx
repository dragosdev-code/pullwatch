import { animated, useSpring, useTrail } from '@react-spring/web';
import { FINISH_COOLDOWN_RING_C, FINISH_COOLDOWN_RING_R } from './constants';

export interface FinishCooldownIndicatorProps {
  motionOff: boolean;
  delayMs: number;
}

/**
 * Fills a ring over `delayMs` and shows a light pulse + dot trail while primary actions are gated.
 */
export function FinishCooldownIndicator({ motionOff, delayMs }: FinishCooldownIndicatorProps) {
  const ring = useSpring({
    from: { p: motionOff ? 1 : 0 },
    to: { p: 1 },
    config: { duration: delayMs },
    immediate: motionOff,
  });

  const dots = useTrail(3, {
    from: { opacity: 0.28, y: 2 },
    to: { opacity: 1, y: 0 },
    loop: motionOff ? false : { reverse: true },
    config: { tension: 220, friction: 18 },
    immediate: motionOff,
  });

  const pulse = useSpring({
    from: { s: 0.92, o: 0.32 },
    to: { s: 1.06, o: 0.72 },
    loop: motionOff ? false : { reverse: true },
    config: { tension: 120, friction: 14 },
    immediate: motionOff,
  });

  return (
    <div className="flex min-h-30 flex-col items-center justify-center gap-4 py-1">
      <div className="relative flex h-[52px] w-[52px] items-center justify-center">
        <animated.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full bg-primary/15 blur-md"
          style={{
            opacity: pulse.o,
            transform: pulse.s.to((sc) => `scale(${sc})`),
          }}
        />
        <svg
          className="relative h-[52px] w-[52px] -rotate-90 text-primary"
          viewBox="0 0 48 48"
          aria-hidden
        >
          <circle
            cx="24"
            cy="24"
            r={FINISH_COOLDOWN_RING_R}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeOpacity={0.18}
          />
          <animated.circle
            cx="24"
            cy="24"
            r={FINISH_COOLDOWN_RING_R}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={FINISH_COOLDOWN_RING_C}
            strokeDashoffset={ring.p.to((p) => FINISH_COOLDOWN_RING_C * (1 - p))}
          />
        </svg>
      </div>
      <div className="flex gap-1.5" aria-hidden>
        {dots.map((dotStyle, i) => (
          <animated.span
            key={i}
            className="h-2 w-2 rounded-full bg-primary/70"
            style={{
              opacity: dotStyle.opacity,
              transform: dotStyle.y.to((y) => `translateY(${y}px)`),
            }}
          />
        ))}
      </div>
      <span className="sr-only">Round summary shown; actions unlock in a moment.</span>
    </div>
  );
}
