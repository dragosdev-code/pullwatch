import clsx from 'clsx';
import { useState } from 'react';
import { useStore } from 'zustand';
import type { GameMode } from '../game-types';
import { useGameStore } from '../context/game-store-context';
import { MODE_METADATA } from '../launcher/mode-metadata';

export interface FinishedOverlayProps {
  /** Current round mode (shown in picker; same selection triggers replay). */
  mode: GameMode;
  onTryAgain: () => void;
  /** When set, user can open the mode grid and switch without leaving the shell. */
  onChangeMode?: (mode: GameMode) => void;
  onExit?: () => void;
}

/**
 * End-of-round summary over the board. Try again remounts the session via the shell; another mode
 * opens an inline picker that calls {@link onChangeMode}.
 */
export function FinishedOverlay({
  mode,
  onTryAgain,
  onChangeMode,
  onExit,
}: FinishedOverlayProps) {
  const store = useGameStore();
  const status = useStore(store, (s) => s.status);
  const [pickingMode, setPickingMode] = useState(false);

  if (status !== 'finished') return null;

  const { score, highestCombo, bugsSquashed, featuresBroken } = store.getState();

  const handlePickMode = (picked: GameMode) => {
    setPickingMode(false);
    if (picked === mode) {
      onTryAgain();
    } else {
      onChangeMode?.(picked);
    }
  };

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
        aria-labelledby={pickingMode ? 'squash-finished-mode-title' : 'squash-finished-title'}
      >
        {pickingMode ? (
          <>
            <h3
              id="squash-finished-mode-title"
              className="mb-3 text-sm font-bold uppercase tracking-wide text-base-content"
            >
              pick a mode
            </h3>
            <div className="mb-4 grid grid-cols-2 gap-2">
              {MODE_METADATA.map((meta) => (
                <button
                  key={meta.mode}
                  type="button"
                  data-testid={`squash-finished-mode-option-${meta.mode}`}
                  onClick={() => handlePickMode(meta.mode)}
                  className={clsx(
                    'flex flex-col gap-0.5 rounded-lg border p-2.5 text-left text-[10px] transition',
                    'border-base-300 bg-base-200/60 hover:border-primary hover:bg-primary/10',
                    meta.mode === mode && 'border-primary/60 bg-primary/5'
                  )}
                >
                  <span className="font-mono font-bold uppercase tracking-wide text-primary">
                    {meta.label}
                  </span>
                  <span className="line-clamp-2 text-[9px] leading-tight text-base-content/65">
                    {meta.tagline}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              data-testid="squash-finished-mode-back"
              onClick={() => setPickingMode(false)}
              className="btn btn-ghost btn-sm w-full font-mono uppercase tracking-wide"
            >
              Back
            </button>
          </>
        ) : (
          <>
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
            <div className="flex flex-col gap-2">
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
                  onClick={() => setPickingMode(true)}
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
            </div>
          </>
        )}
      </div>
    </div>
  );
}
