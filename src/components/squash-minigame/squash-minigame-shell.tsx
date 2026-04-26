import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  roundId: number;
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
   * RAF backed loop. The shell keeps the latest function in a ref and only re-runs the session
   * `mode` so inline lambdas on each parent render do not remount the loop in a tight loop. For
   * `mode`-stable injects, keep referential stability with `useCallback` or a module singleton if
   * you need the factory identity to change without a mode change.
   */
  createStoreFn?: () => GameStore;
  createLoopFn?: (store: GameStore) => GameLoop;
  audioOptions?: UseAudioEffectsOptions;
  /** Disable the FCT canvas overlay. Tests omit this to keep happy dom canvas mocks tiny. */
  disableFctOverlay?: boolean;
}

const defaultCreateStore = () => createGameStore();
const defaultCreateLoop = (store: GameStore) => createGameLoop(store);

/** Survives React 18 dev StrictMode subtree remounts; paired with `store.roundId` from `startGame`. */
let lastNotifiedFinishRoundId: number | null = null;

/** Test only. */
export function __resetLastFinishNotificationForTests(): void {
  lastNotifiedFinishRoundId = null;
}

/**
 * Owns one game session: builds the vanilla store, drives the RAF loop, and renders the board.
 *
 * WHY [restart on mode change]: switching modes mid round is a fresh session, so the effect
 * disposes the previous store/loop and rebuilds. Phase 5 launchers always pass a fresh `mode`
 * per attempt, so this is the natural reset trigger.
 *
 * WHY [ref factories + mode only in deps]: keeps the default factories from churning the effect
 * and avoids a parent render loop when the caller's inject lambdas are not referentially stable.
 * The ref always points at the latest inject so a mode change still uses the current factory.
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
  const createStoreRef = useRef(createStoreFn);
  const createLoopRef = useRef(createLoopFn);
  createStoreRef.current = createStoreFn;
  createLoopRef.current = createLoopFn;

  useEffect(() => {
    const buildStore = createStoreRef.current;
    const buildLoop = createLoopRef.current;
    const nextStore = buildStore();
    const nextLoop = buildLoop(nextStore);
    setStore(nextStore);

    nextStore.getState().startGame(mode, performance.now());
    nextLoop.start();

    return () => {
      nextLoop.stop();
      nextStore.getState().reset();
    };
  }, [mode]);

  if (!store) {
    return (
      <div
        data-testid="squash-shell-loading"
        className="flex min-h-0 flex-1 items-center justify-center p-4 text-xs uppercase"
      >
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
      <FinishedOverlay onExit={onExit} />
    </div>
  );
}

/**
 * Fires `onFinish` once per finished `roundId` (survives StrictMode remount). Captures summary
 * stats at the transition so a subsequent reset does not zero them before the launcher reads them.
 */
function useFinishedReporter(
  mode: GameMode,
  onFinish: ((summary: FinishedRoundSummary) => void) | undefined
) {
  const store = useGameStore();
  const status = useStore(store, (s) => s.status);

  useEffect(() => {
    if (status !== 'finished' || !onFinish) {
      return;
    }
    const s = store.getState();
    if (s.roundId === lastNotifiedFinishRoundId) {
      return;
    }
    lastNotifiedFinishRoundId = s.roundId;
    onFinish({
      mode,
      roundId: s.roundId,
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
