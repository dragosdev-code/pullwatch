import { useEffect, type PointerEvent as ReactPointerEvent } from 'react';
import { useSpring, to, type Interpolation } from '@react-spring/web';

const DEFAULT_TRAVEL_PX = 3;
const DEFAULT_SPRING_CONFIG = { tension: 300, friction: 24 };

interface UseMagneticHoverOptions {
  enabled: boolean;
  travel?: number;
}

interface MagneticHover {
  transform: Interpolation<string>;
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerLeave: () => void;
}

/**
 * Pointer-driven magnetic drift on a single element — the target follows the
 * cursor by up to `travel` px in each axis, with a soft clamp so sensitivity
 * peaks at the midpoint between center and edge.
 *
 * Caller is responsible for gating `enabled` on capability (e.g. fine pointer)
 * and any app-specific disabled state; the hook recenters on `enabled → false`
 * so the target never gets stranded mid-drift.
 */
export const useMagneticHover = ({
  enabled,
  travel = DEFAULT_TRAVEL_PX,
}: UseMagneticHoverOptions): MagneticHover => {
  const [spring, api] = useSpring(() => ({
    x: 0,
    y: 0,
    config: DEFAULT_SPRING_CONFIG,
  }));

  useEffect(() => {
    if (!enabled) api.start({ x: 0, y: 0 });
  }, [enabled, api]);

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (!enabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    const nx = Math.max(-1, Math.min(1, (dx / rect.width) * 2));
    const ny = Math.max(-1, Math.min(1, (dy / rect.height) * 2));
    api.start({ x: nx * travel, y: ny * travel });
  };

  const onPointerLeave = () => api.start({ x: 0, y: 0 });

  const transform = to([spring.x, spring.y], (x, y) => `translate3d(${x}px, ${y}px, 0)`);

  return { transform, onPointerMove, onPointerLeave };
};
