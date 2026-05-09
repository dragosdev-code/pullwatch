import { Suspense, useCallback, useState } from 'react';
import clsx from 'clsx';
import type { MinigameStats } from '@common/types';
import type { FinishCelebration, FinishedRoundSummary, GameMode } from '../game-types';
import { SquashMinigameLazy } from '../squash-minigame.lazy';
import { MODE_METADATA } from './mode-metadata';
import { SettingsModeStatsPanel } from './settings-mode-stats';
import {
  useRecordRoundResult,
  type RecordRoundPersistOutcome,
} from '../hooks/use-record-round-result';

export interface NeoTerminalLauncherProps {
  stats: MinigameStats;
  /** When set, mode picks open the app overlay instead of mounting `SquashMinigameLazy` inline. */
  onRequestPlayMode?: (mode: GameMode) => void;
  /** Test seam: replaces the real recorder so storage IO can be observed without mocks. */
  recordRoundResult?: (
    summary: FinishedRoundSummary
  ) => Promise<RecordRoundPersistOutcome | void> | RecordRoundPersistOutcome | void;
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
  const [finishCelebration, setFinishCelebration] = useState<FinishCelebration | null>(null);
  const fallbackRecorder = useRecordRoundResult();

  const handleFinish = useCallback(
    (summary: FinishedRoundSummary) => {
      const recorder = recordRoundResult ?? fallbackRecorder;
      void Promise.resolve(recorder(summary)).then((meta) => {
        if (meta) {
          setFinishCelebration({
            roundId: summary.roundId,
            isNewHighScore: meta.isNewHighScore,
            previousHighScore: meta.previousHighScore,
          });
        }
      });
    },
    [recordRoundResult, fallbackRecorder]
  );

  const exitToMenu = useCallback(() => {
    setFinishCelebration(null);
    setActiveMode(null);
  }, []);

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
            finishCelebration={finishCelebration}
          />
        </Suspense>
      </div>
    );
  }

  return (
    <div data-testid="neo-terminal-menu">
      <div className="grid grid-cols-2 gap-1.5">
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
                'group flex flex-col justify-between gap-0.5 rounded-lg border border-base-300 bg-base-200/60 p-2 text-left transition',
                'hover:border-primary hover:bg-primary/10 hover:shadow-[0_0_12px_-4px_var(--color-primary)]',
                isLast && 'border-accent'
              )}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-primary">
                    {meta.label}
                  </span>
                  {isLast && (
                    <span className="rounded bg-accent px-1 py-0.5 font-mono text-[10px] uppercase leading-none text-accent-content">
                      last
                    </span>
                  )}
                </div>

                <p className="line-clamp-2 text-[11px] leading-snug text-base-content/70">
                  {meta.tagline}
                </p>
              </div>
              <SettingsModeStatsPanel
                data-testid={`neo-terminal-stats-${meta.mode}`}
                playCount={modeStats.playCount}
                highScore={modeStats.highScore}
                highestCombo={modeStats.highestCombo}
              />
            </button>
          );
        })}
      </div>

      <footer
        data-testid="neo-terminal-overall"
        className="mt-2 flex justify-between border-t border-primary/30 pt-1.5 font-mono text-[11px] uppercase tracking-wide text-base-content/60"
      >
        <span>bugs {stats.overall.totalBugsSquashed}</span>
        <span>features {stats.overall.totalFeaturesBroken}</span>
        <span>played {stats.overall.totalTimePlayedSeconds}s</span>
      </footer>
    </div>
  );
}
