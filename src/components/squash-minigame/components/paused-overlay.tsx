import type { MinigameSessionCheckpoint } from '@common/types';
import { formatScore } from '../format-score';

export interface PausedOverlayProps {
  checkpoint: MinigameSessionCheckpoint;
  onResume: () => void;
  onDiscard: () => void;
}

/**
 * Shown when the popup re-opens with a saved mid-round checkpoint. Offers Resume (continue
 * where the player left off) or Discard (throw away the checkpoint and start fresh).
 */
export function PausedOverlay({ checkpoint, onResume, onDiscard }: PausedOverlayProps) {
  const timeLeftSeconds = Math.ceil(checkpoint.timeRemainingMs / 1000);

  return (
    <div
      data-testid="squash-paused-overlay"
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 p-6"
    >
      <div className="w-full max-w-xs rounded-2xl border border-base-content/10 bg-base-100/85 px-5 py-6 text-center shadow-2xl shadow-base-300/40">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-base-content">
          game paused
        </h3>
        <ul className="mb-5 space-y-1 text-xs text-base-content/90">
          <li>score {formatScore(checkpoint.score)}</li>
          <li>combo x{checkpoint.combo}</li>
          <li>time left {timeLeftSeconds}s</li>
        </ul>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            data-testid="squash-paused-resume"
            onClick={onResume}
            className="btn btn-primary btn-sm w-full font-semibold uppercase tracking-wide"
          >
            Resume
          </button>
          <button
            type="button"
            data-testid="squash-paused-discard"
            onClick={onDiscard}
            className="btn btn-ghost btn-sm w-full font-semibold uppercase tracking-wide text-base-content/80"
          >
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}
