import { useLayoutEffect, useRef } from 'react';
import clsx from 'clsx';
import type { FinishedRoundSummary, GameMode } from '../game-types';
import { GameBoard } from './game-board';
import { FinishedOverlay } from './finished-overlay';
import { Hud } from './hud';
import { FctOverlay } from '../fct/fct-overlay';
import { useAudioEffects, type UseAudioEffectsOptions } from '../hooks/use-audio-effects';
import { useFinishedReporter } from '../hooks/use-finished-reporter';
import { useScreenShake } from '../hooks/use-screen-shake';

export interface SquashMinigameBodyProps {
  mode: GameMode;
  onExit?: () => void;
  onChangeMode?: (mode: GameMode) => void;
  onFinish?: (summary: FinishedRoundSummary) => void;
  onTryAgain: () => void;
  audioOptions?: UseAudioEffectsOptions;
  disableFctOverlay: boolean;
}

/**
 * Playfield + HUD + overlays inside `GameStoreProvider`. ResizeObserver keeps the grid square.
 */
export function SquashMinigameBody({
  mode,
  onExit,
  onChangeMode,
  onFinish,
  onTryAgain,
  audioOptions,
  disableFctOverlay,
}: SquashMinigameBodyProps) {
  useAudioEffects(audioOptions);
  useFinishedReporter(mode, onFinish);
  const isShaking = useScreenShake();
  const playgroundRef = useRef<HTMLDivElement>(null);
  const squareRef = useRef<HTMLDivElement>(null);

  // WHY [ResizeObserver]: largest square that fits the padded playground is not expressible
  // reliably with flex + aspect-ratio alone across extension popup sizes; we size the grid slot
  // in px so cells stay square without scrolling.
  useLayoutEffect(() => {
    const slot = playgroundRef.current;
    const inner = squareRef.current;
    if (!slot || !inner) return;

    const apply = () => {
      const w = slot.clientWidth;
      const h = slot.clientHeight;
      const s = Math.max(0, Math.floor(Math.min(w, h)));
      inner.style.width = `${s}px`;
      inner.style.height = `${s}px`;
    };

    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(slot);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col gap-2 overflow-hidden p-3 sm:gap-3 sm:p-4">
      <Hud onExit={onExit} />
      <div
        ref={playgroundRef}
        data-testid="squash-board-container"
        data-shaking={isShaking ? 'true' : 'false'}
        className={clsx(
          'relative box-border flex min-h-0 flex-1 min-w-0 items-center justify-center px-3 pb-3 pt-1 sm:px-5 sm:pb-5 sm:pt-2',
          isShaking && 'pw-squash-shake'
        )}
      >
        <div
          ref={squareRef}
          className="relative mx-auto min-h-0 min-w-0 shrink-0 overflow-hidden rounded-lg border border-base-300/40 bg-base-200/30"
        >
          <div className="relative box-border h-full w-full p-2 sm:p-3">
            <GameBoard />
            {!disableFctOverlay && <FctOverlay />}
          </div>
        </div>
      </div>
      <FinishedOverlay
        mode={mode}
        onTryAgain={onTryAgain}
        onChangeMode={onChangeMode}
        onExit={onExit}
      />
    </div>
  );
}
