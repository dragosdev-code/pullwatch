import { useStore } from 'zustand';
import { useGameStore } from '../context/game-store-context';

export interface FinishedOverlayProps {
  onExit?: () => void;
}

/**
 * End-of-round summary modal over the board. Lives beside {@link Hud} / {@link GameBoard} so the
 * shell file stays focused on session wiring.
 */
export function FinishedOverlay({ onExit }: FinishedOverlayProps) {
  const store = useGameStore();
  const status = useStore(store, (s) => s.status);
  if (status !== 'finished') return null;

  const { score, highestCombo, bugsSquashed, featuresBroken } = store.getState();

  return (
    <div
      data-testid="squash-finished-overlay"
      className="absolute inset-0 z-50 flex items-center justify-center bg-base-300/55 p-4 backdrop-blur-[3px]"
      role="presentation"
    >
      <div
        className="w-full max-w-xs rounded-2xl border border-base-content/10 bg-base-100/85 px-5 py-6 text-center shadow-2xl shadow-base-300/40 sm:max-w-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="squash-finished-title"
      >
        <h3
          id="squash-finished-title"
          className="mb-3 text-sm font-bold uppercase tracking-wide text-base-content"
        >
          round over
        </h3>
        <ul className="mb-5 space-y-1 text-xs text-base-content/90">
          <li data-testid="squash-finished-score">final score {score}</li>
          <li data-testid="squash-finished-combo">best combo x{highestCombo}</li>
          <li data-testid="squash-finished-bugs">bugs {bugsSquashed}</li>
          <li data-testid="squash-finished-features">features {featuresBroken}</li>
        </ul>
        {onExit ? (
          <button
            type="button"
            data-testid="squash-finished-exit"
            onClick={onExit}
            className="btn btn-primary btn-sm w-full max-w-48 font-semibold uppercase tracking-wide"
          >
            Close
          </button>
        ) : null}
      </div>
    </div>
  );
}
