import clsx from 'clsx';
import { useState } from 'react';
import { useStore } from 'zustand';
import type { GameMode } from '../game-types';
import { useGameStore } from '../context/game-store-context';
import { MODE_METADATA } from '../launcher/mode-metadata';

export interface FinishedOverlayProps {
  /** Current round mode (default selection in picker; same as committed choice triggers replay). */
  mode: GameMode;
  onTryAgain: () => void;
  /** When set, user can open the mode grid and switch without leaving the shell. */
  onChangeMode?: (mode: GameMode) => void;
  onExit?: () => void;
}

/**
 * End-of-round summary over the board. Try again remounts the session via the shell; another mode
 * opens an inline picker: tap a mode to select it, then Play to start.
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
  const [pickerSelected, setPickerSelected] = useState<GameMode>(mode);

  if (status !== 'finished') return null;

  const { score, highestCombo, bugsSquashed, featuresBroken } = store.getState();

  const openModePicker = () => {
    setPickerSelected(mode);
    setPickingMode(true);
  };

  const commitPickerSelection = () => {
    const picked = pickerSelected;
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
        className={clsx(
          'w-full rounded-2xl border border-base-content/10 bg-base-100/85 text-center shadow-2xl shadow-base-300/40',
          pickingMode
            ? 'max-w-md px-6 py-7 sm:max-w-lg sm:px-8 sm:py-8'
            : 'max-w-xs px-5 py-6 sm:max-w-sm'
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={pickingMode ? 'squash-finished-mode-title' : 'squash-finished-title'}
      >
        {pickingMode ? (
          <>
            <h3
              id="squash-finished-mode-title"
              className="mb-4 text-base font-bold uppercase tracking-wide text-base-content sm:text-lg"
            >
              pick a mode
            </h3>
            <p className="mb-4 text-left text-sm leading-snug text-base-content/75 sm:text-base">
              Tap a mode to select it, then press Play to start your next round.
            </p>
            <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4">
              {MODE_METADATA.map((meta) => {
                const isSelected = pickerSelected === meta.mode;
                return (
                  <button
                    key={meta.mode}
                    type="button"
                    data-testid={`squash-finished-mode-option-${meta.mode}`}
                    aria-pressed={isSelected}
                    onClick={() => setPickerSelected(meta.mode)}
                    className={clsx(
                      'flex flex-col gap-1 rounded-xl border p-3 text-left transition sm:gap-1.5 sm:p-4',
                      'border-base-300 bg-base-200/60 hover:border-primary/70 hover:bg-primary/10',
                      isSelected && 'border-primary bg-primary/15 ring-2 ring-primary/35'
                    )}
                  >
                    <span className="font-mono text-xs font-bold uppercase tracking-wide text-primary sm:text-sm">
                      {meta.label}
                    </span>
                    <span className="line-clamp-3 text-xs leading-snug text-base-content/75 sm:text-sm">
                      {meta.tagline}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col gap-2 sm:gap-3">
              <button
                type="button"
                data-testid="squash-finished-mode-play"
                onClick={commitPickerSelection}
                className="btn btn-primary w-full text-sm font-semibold uppercase tracking-wide sm:text-base"
              >
                Play
              </button>
              <button
                type="button"
                data-testid="squash-finished-mode-back"
                onClick={() => setPickingMode(false)}
                className="btn btn-ghost w-full text-sm font-mono uppercase tracking-wide sm:text-base"
              >
                Back
              </button>
            </div>
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
            </div>
          </>
        )}
      </div>
    </div>
  );
}
