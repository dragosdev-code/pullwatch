import { useStore } from 'zustand';
import { useGameStore } from '../context/game-store-context';

function formatSeconds(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  return `${totalSeconds}s`;
}

export interface HudProps {
  /** When set (e.g. full-popup overlay), shows a close control so the round can exit before `finished`. */
  onExit?: () => void;
}

/**
 * Header strip showing score, combo, and time remaining. Each value is its own atomic
 * subscription so a combo bump does not redraw the score node and vice versa.
 */
export function Hud({ onExit }: HudProps) {
  const store = useGameStore();
  const score = useStore(store, (s) => s.score);
  const combo = useStore(store, (s) => s.combo);
  const timeRemainingMs = useStore(store, (s) => s.timeRemainingMs);

  return (
    <div className="flex w-full shrink-0 items-center gap-2 border-b border-base-300/40 pb-2 text-xs font-mono uppercase tracking-wider">
      <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <span data-testid="squash-hud-score">score {score}</span>
        <span data-testid="squash-hud-combo">x{combo}</span>
        <span data-testid="squash-hud-time">{formatSeconds(timeRemainingMs)}</span>
      </div>
      {onExit ? (
        <button
          type="button"
          data-testid="squash-hud-close"
          onClick={onExit}
          className="btn btn-ghost btn-xs shrink-0 font-semibold normal-case"
        >
          Close
        </button>
      ) : null}
    </div>
  );
}
