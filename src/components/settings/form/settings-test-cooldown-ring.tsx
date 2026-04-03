import { animated, useSpring } from '@react-spring/web';
import { SETTINGS_NOTIFICATION_TEST_COOLDOWN_MS } from '../../../../extension/common/constants';

/** Matches RefreshGlyph math; smaller radius for the inline settings Test pill. */
const R = 5.5;
const VIEW = 14;
const CX = VIEW / 2;
const CY = VIEW / 2;
const CIRC = 2 * Math.PI * R;

interface SettingsTestCooldownRingProps {
  /** When true, stroke animates from empty to full over SETTINGS_NOTIFICATION_TEST_COOLDOWN_MS. */
  active: boolean;
}

/**
 * Radial cooldown indicator — same strokeDasharray/offset pattern as RefreshGlyph (refresh-button/components/refresh-glyph.tsx)
 * so the settings test control visually matches the header refresh ring.
 */
export function SettingsTestCooldownRing({ active }: SettingsTestCooldownRingProps) {
  const ringSpring = useSpring({
    from: { strokeDashoffset: CIRC },
    strokeDashoffset: active ? 0 : CIRC,
    config: active
      ? { duration: SETTINGS_NOTIFICATION_TEST_COOLDOWN_MS, easing: (t: number) => t }
      : { duration: 0 },
  });

  return (
    <svg
      className="pointer-events-none shrink-0 -rotate-90 text-primary"
      width={VIEW}
      height={VIEW}
      viewBox={`0 0 ${VIEW} ${VIEW}`}
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
