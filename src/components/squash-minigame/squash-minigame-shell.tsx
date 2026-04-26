import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useStore } from 'zustand';
import { createGameStore, type GameStore } from './game-store';
import { createGameLoop, type GameLoop } from './game-loop';
import type { GameMode } from './game-types';
import { GameStoreProvider, useGameStore } from './context/game-store-context';
import { GameBoard } from './components/game-board';
import { Hud } from './components/hud';
import { FctOverlay } from './fct/fct-overlay';
import { useAudioEffects, type UseAudioEffectsOptions } from './hooks/use-audio-effects';
import { useScreenShake } from './hooks/use-screen-shake';

export interface FinishedRoundSummary {
  mode: GameMode;
  score: number;
  highestCombo: number;
  bugsSquashed: number;
  featuresBroken: number;
  durationSeconds: number;
}

export interface SquashMinigameProps {
  mode: GameMode;
  onExit?: () => void;
  /**
   * Fired once when the round transitions to `finished`. The launcher uses this to fold the
   * round into persisted MinigameStats. Decoupled from the shell so storage stays out of the
   * render layer's tests.
   */
  onFinish?: (summary: FinishedRoundSummary) => void;
  /**
   * Hooks for tests. Production callers omit these and the shell builds a real store and a real
   * RAF backed loop.
   */
  createStoreFn?: () => GameStore;
  createLoopFn?: (store: GameStore) => GameLoop;
  audioOptions?: UseAudioEffectsOptions;
  /** Disable the FCT canvas overlay. Tests omit this to keep happy dom canvas mocks tiny. */
  disableFctOverlay?: boolean;
}

const defaultCreateStore = () => createGameStore();
const defaultCreateLoop = (store: GameStore) => createGameLoop(store);

/**
 * Owns one game session: builds the vanilla store, drives the RAF loop, and renders the board.
 *
 * WHY [restart on mode change]: switching modes mid round is a fresh session, so the effect
 * disposes the previous store/loop and rebuilds. Phase 5 launchers always pass a fresh `mode`
 * per attempt, so this is the natural reset trigger.
 *
 * WHY [stable factory defaults]: the factories live at module scope so the effect dependency
 * array does not churn on every render and re mount the loop infinitely.
 */
export function SquashMinigame({
  mode,
  onExit,
  onFinish,
  createStoreFn = defaultCreateStore,
  createLoopFn = defaultCreateLoop,
  audioOptions,
  disableFctOverlay = false,
}: SquashMinigameProps) {
  const [store, setStore] = useState<GameStore | null>(null);

  useEffect(() => {
    const nextStore = createStoreFn();
    const nextLoop = createLoopFn(nextStore);
    setStore(nextStore);

    nextStore.getState().startGame(mode, performance.now());
    nextLoop.start();

    return () => {
      nextLoop.stop();
      nextStore.getState().reset();
    };
  }, [mode, createStoreFn, createLoopFn]);

  if (!store) {
    return (
      <div data-testid="squash-shell-loading" className="p-4 text-xs uppercase">
        booting
      </div>
    );
  }

  return (
    <GameStoreProvider store={store}>
      <SquashMinigameBody
        mode={mode}
        onExit={onExit}
        onFinish={onFinish}
        audioOptions={audioOptions}
        disableFctOverlay={disableFctOverlay}
      />
    </GameStoreProvider>
  );
}

interface BodyProps {
  mode: GameMode;
  onExit?: () => void;
  onFinish?: (summary: FinishedRoundSummary) => void;
  audioOptions?: UseAudioEffectsOptions;
  disableFctOverlay: boolean;
}

function SquashMinigameBody({
  mode,
  onExit,
  onFinish,
  audioOptions,
  disableFctOverlay,
}: BodyProps) {
  useAudioEffects(audioOptions);
  useFinishedReporter(mode, onFinish);
  const isShaking = useScreenShake();

  return (
    <div className="flex w-full flex-col gap-3 p-3">
      <Hud />
      <div
        data-testid="squash-board-container"
        data-shaking={isShaking ? 'true' : 'false'}
        className={clsx('relative w-full', isShaking && 'pw-squash-shake')}
      >
        <GameBoard />
        {!disableFctOverlay && <FctOverlay />}
      </div>
      <FinishedOverlay onExit={onExit} />
    </div>
  );
}

/**
 * Fires `onFinish` exactly once per session when the store flips to `finished`. Captures the
 * summary stats at the transition so a subsequent reset (Phase 5 launcher returning to the menu)
 * does not zero them out before the launcher reads them.
 */
function useFinishedReporter(
  mode: GameMode,
  onFinish: ((summary: FinishedRoundSummary) => void) | undefined
) {
  const store = useGameStore();
  const status = useStore(store, (s) => s.status);
  const reportedRef = useRef(false);

  useEffect(() => {
    if (status !== 'finished') {
      reportedRef.current = false;
      return;
    }
    if (reportedRef.current) return;
    reportedRef.current = true;
    if (!onFinish) return;
    const s = store.getState();
    onFinish({
      mode,
      score: s.score,
      highestCombo: s.highestCombo,
      bugsSquashed: s.bugsSquashed,
      featuresBroken: s.featuresBroken,
      durationSeconds: Math.round(s.elapsedMs / 1000),
    });
  }, [status, store, mode, onFinish]);
}

function FinishedOverlay({ onExit }: { onExit?: () => void }) {
  const store = useGameStore();
  const status = useStore(store, (s) => s.status);
  if (status !== 'finished') return null;

  const { score, highestCombo, bugsSquashed, featuresBroken } = store.getState();

  return (
    <div
      data-testid="squash-finished-overlay"
      className="flex flex-col items-center gap-2 rounded-md border border-base-300 bg-base-200 p-4 text-center"
    >
      <h3 className="text-sm font-bold uppercase tracking-wide">round over</h3>
      <ul className="text-xs">
        <li data-testid="squash-finished-score">final score {score}</li>
        <li data-testid="squash-finished-combo">best combo x{highestCombo}</li>
        <li data-testid="squash-finished-bugs">bugs {bugsSquashed}</li>
        <li data-testid="squash-finished-features">features {featuresBroken}</li>
      </ul>
      {onExit && (
        <button
          type="button"
          data-testid="squash-finished-exit"
          onClick={onExit}
          className="btn btn-sm"
        >
          exit
        </button>
      )}
    </div>
  );
}
