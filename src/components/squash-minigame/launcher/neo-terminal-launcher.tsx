import { Suspense, useCallback, useState } from 'react';
import clsx from 'clsx';
import type { MinigameStats } from '@common/types';
import type { FinishedRoundSummary, GameMode } from '../game-types';
import { SquashMinigameLazy } from '../squash-minigame.lazy';
import { MODE_METADATA } from './mode-metadata';
import { useRecordRoundResult } from '../hooks/use-record-round-result';

export interface NeoTerminalLauncherProps {
  stats: MinigameStats;
  /** When set, mode picks open the app overlay instead of mounting `SquashMinigameLazy` inline. */
  onRequestPlayMode?: (mode: GameMode) => void;
  /** Test seam: replaces the real recorder so storage IO can be observed without mocks. */
  recordRoundResult?: (summary: FinishedRoundSummary) => Promise<void> | void;
}

/**
 * Hidden Easter egg launcher. Style: glassmorphism plate with neon accents, theme palette comes
 * from DaisyUI tokens (`primary`, `accent`, `success`) so the user's chosen theme drives the look.
 */
export function NeoTerminalLauncher({
  stats,
  onRequestPlayMode,
  recordRoundResult,
}: NeoTerminalLauncherProps) {
  const [activeMode, setActiveMode] = useState<GameMode | null>(null);
  const fallbackRecorder = useRecordRoundResult();

  const handleFinish = useCallback(
    (summary: FinishedRoundSummary) => {
      const recorder = recordRoundResult ?? fallbackRecorder;
      void recorder(summary);
    },
    [recordRoundResult, fallbackRecorder]
  );

  const exitToMenu = useCallback(() => setActiveMode(null), []);

  if (activeMode) {
    return (
      <div
        data-testid="neo-terminal-active"
        className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-primary/40 bg-base-100/70 p-1 shadow-[0_0_24px_-12px_var(--color-primary)] backdrop-blur"
      >
        <Suspense
          fallback={
            <div data-testid="neo-terminal-loading" className="p-6 text-center text-xs uppercase">
              loading squash module
            </div>
          }
        >
          <SquashMinigameLazy
            mode={activeMode}
            onExit={exitToMenu}
            onFinish={handleFinish}
            onChangeMode={(next) => setActiveMode(next)}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div
      data-testid="neo-terminal-menu"
      className="rounded-xl border border-primary/40 bg-base-100/70 p-4 shadow-[0_0_24px_-12px_var(--color-primary)] backdrop-blur"
    >
      <header className="mb-3 flex items-center justify-between border-b border-primary/30 pb-2 font-mono text-[11px] uppercase tracking-widest text-primary">
        <span>squash the bugs</span>
        <span className="text-accent">v0.42</span>
      </header>

      <div className="grid grid-cols-2 gap-2">
        {MODE_METADATA.map((meta) => {
          const modeStats = stats.modes[meta.mode];
          const isLast = stats.lastPlayedMode === meta.mode;
          return (
            <button
              key={meta.mode}
              type="button"
              data-testid={`neo-terminal-mode-${meta.mode}`}
              onClick={() =>
                onRequestPlayMode ? onRequestPlayMode(meta.mode) : setActiveMode(meta.mode)
              }
              className={clsx(
                'group flex flex-col gap-1 rounded-lg border border-base-300 bg-base-200/60 p-3 text-left transition',
                'hover:border-primary hover:bg-primary/10 hover:shadow-[0_0_12px_-4px_var(--color-primary)]',
                isLast && 'border-accent'
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-primary group-hover:text-primary-content">
                  {meta.label}
                </span>
                {isLast && (
                  <span className="rounded bg-accent px-1.5 py-0.5 font-mono text-[9px] uppercase text-accent-content">
                    last
                  </span>
                )}
              </div>
              <p className="text-[11px] text-base-content/70">{meta.tagline}</p>
              <dl
                data-testid={`neo-terminal-stats-${meta.mode}`}
                className="mt-1 flex gap-3 font-mono text-[10px] uppercase tracking-wide text-base-content/60"
              >
                <span>plays {modeStats.playCount}</span>
                <span>hi {modeStats.highScore}</span>
                <span>x{modeStats.highestCombo}</span>
              </dl>
            </button>
          );
        })}
      </div>

      <footer
        data-testid="neo-terminal-overall"
        className="mt-3 flex justify-between border-t border-primary/30 pt-2 font-mono text-[10px] uppercase tracking-wide text-base-content/60"
      >
        <span>bugs {stats.overall.totalBugsSquashed}</span>
        <span>features {stats.overall.totalFeaturesBroken}</span>
        <span>played {stats.overall.totalTimePlayedSeconds}s</span>
      </footer>
    </div>
  );
}
