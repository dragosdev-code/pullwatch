import clsx from 'clsx';
import { useEffect, useState } from 'react';
import type { GameMode } from '../game-types';
import { usePrefersReducedMotion } from '@src/hooks/use-prefers-reduced-motion';
import { MODE_METADATA } from '../launcher/mode-metadata';
import {
  SQUASH_QUICK_START_HINTS,
  SQUASH_QUICK_START_SUBTITLE,
  SQUASH_QUICK_START_TITLE,
} from './squash-quick-start-copy';

export interface SquashQuickStartBoardProps {
  lastPlayedMode?: GameMode;
  onStart: (mode: GameMode) => void;
  onClose: () => void;
}

/**
 * First-time header path: short how-to, mode pick, then start. Presentational only; persistence
 * and session transitions live in {@link SquashMinigameExperienceProvider}.
 */
export function SquashQuickStartBoard({
  lastPlayedMode,
  onStart,
  onClose,
}: SquashQuickStartBoardProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [entered, setEntered] = useState(reducedMotion);
  const [selected, setSelected] = useState<GameMode>(lastPlayedMode ?? 'standard');

  useEffect(() => {
    if (reducedMotion) {
      setEntered(true);
      return;
    }
    let cancelled = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!cancelled) setEntered(true);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [reducedMotion]);

  return (
    <div
      data-testid="squash-quick-start-board"
      className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center overflow-y-auto bg-base-300/95 p-4"
    >
      <div
        className={clsx(
          'w-full max-w-lg transform-gpu rounded-xl border border-primary/35 bg-base-100/80 p-5 shadow-[0_0_28px_-14px_var(--color-primary)] backdrop-blur',
          !reducedMotion &&
            'transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
          entered ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-3 scale-[0.99] opacity-0'
        )}
      >
        <header className="mb-4 border-b border-primary/25 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="m-0 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                {SQUASH_QUICK_START_SUBTITLE}
              </p>
              <h2 className="mt-1 font-mono text-lg font-bold uppercase tracking-wide text-base-content">
                {SQUASH_QUICK_START_TITLE}
              </h2>
            </div>
            <button
              type="button"
              data-testid="squash-quick-start-close"
              onClick={onClose}
              className="btn btn-ghost btn-xs font-mono uppercase tracking-wide"
            >
              Close
            </button>
          </div>
        </header>

        <ul className="mb-5 list-inside list-disc space-y-1.5 font-mono text-[11px] leading-snug text-base-content/80">
          {SQUASH_QUICK_START_HINTS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>

        <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-base-content/50">
          Choose mode
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-2">
          {MODE_METADATA.map((meta) => {
            const isSelected = selected === meta.mode;
            const isLast = lastPlayedMode === meta.mode;
            return (
              <button
                key={meta.mode}
                type="button"
                data-testid={`squash-quick-start-mode-${meta.mode}`}
                onClick={() => setSelected(meta.mode)}
                className={clsx(
                  'group flex flex-col gap-1 rounded-lg border p-3 text-left transition',
                  'border-base-300 bg-base-200/70 hover:border-primary hover:bg-primary/10',
                  isSelected &&
                    'border-primary bg-primary/15 shadow-[0_0_12px_-4px_var(--color-primary)]'
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-primary">
                    {meta.label}
                  </span>
                  {isLast ? (
                    <span className="shrink-0 rounded bg-accent/90 px-1 py-0.5 font-mono text-[8px] uppercase text-accent-content">
                      last played
                    </span>
                  ) : null}
                </div>
                <p className="text-[11px] text-base-content/70">{meta.tagline}</p>
              </button>
            );
          })}
        </div>

        <footer className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-primary/20 pt-4">
          <button
            type="button"
            data-testid="squash-quick-start-start"
            className="btn btn-primary btn-sm font-mono uppercase tracking-wide"
            onClick={() => onStart(selected)}
          >
            Start
          </button>
        </footer>
      </div>
    </div>
  );
}
