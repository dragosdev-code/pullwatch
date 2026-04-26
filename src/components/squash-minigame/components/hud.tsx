import { useStore } from 'zustand';
import { useGameStore } from '../context/game-store-context';

function formatSeconds(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  return `${totalSeconds}s`;
}

/**
 * Header strip showing score, combo, and time remaining. Each value is its own atomic
 * subscription so a combo bump does not redraw the score node and vice versa.
 */
export function Hud() {
  const store = useGameStore();
  const score = useStore(store, (s) => s.score);
  const combo = useStore(store, (s) => s.combo);
  const timeRemainingMs = useStore(store, (s) => s.timeRemainingMs);

  return (
    <div className="flex w-full items-center justify-between text-xs font-mono uppercase tracking-wider">
      <span data-testid="squash-hud-score">score {score}</span>
      <span data-testid="squash-hud-combo">x{combo}</span>
      <span data-testid="squash-hud-time">{formatSeconds(timeRemainingMs)}</span>
    </div>
  );
}
