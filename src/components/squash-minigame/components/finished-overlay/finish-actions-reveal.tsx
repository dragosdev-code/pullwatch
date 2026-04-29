import { animated, useSpring } from '@react-spring/web';
import type { GameMode } from '../../game-types';

export interface FinishActionsRevealProps {
  motionOff: boolean;
  onTryAgain: () => void;
  onChangeMode?: (mode: GameMode) => void;
  onExit?: () => void;
  openModePicker: () => void;
}

/**
 * Primary CTA stack for the end-of-round card; springs in when the action delay elapses.
 */
export function FinishActionsReveal({
  motionOff,
  onTryAgain,
  onChangeMode,
  onExit,
  openModePicker,
}: FinishActionsRevealProps) {
  const spring = useSpring({
    from: { opacity: 0, y: 16 },
    to: { opacity: 1, y: 0 },
    config: { tension: 280, friction: 30 },
    immediate: motionOff,
  });

  return (
    <animated.div className="flex flex-col gap-2" style={spring}>
      <button
        type="button"
        data-testid="squash-finished-try-again"
        onClick={onTryAgain}
        className="btn btn-primary btn-sm w-full font-semibold uppercase tracking-wide"
      >
        Try again
      </button>
      {onChangeMode ? (
        <button
          type="button"
          data-testid="squash-finished-change-mode"
          onClick={openModePicker}
          className="btn btn-outline btn-sm w-full font-semibold uppercase tracking-wide"
        >
          Another mode
        </button>
      ) : null}
      {onExit ? (
        <button
          type="button"
          data-testid="squash-finished-exit"
          onClick={onExit}
          className="btn btn-ghost btn-sm w-full font-semibold uppercase tracking-wide text-base-content/80"
        >
          Exit minigame
        </button>
      ) : null}
    </animated.div>
  );
}
