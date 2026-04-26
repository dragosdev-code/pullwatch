import { useEffect, useRef, useState } from 'react';
import { createGameStore, type GameStore } from './game-store';
import { createGameLoop, type GameLoop } from './game-loop';
import type { FinishedRoundSummary, GameMode } from './game-types';
import { GameStoreProvider } from './context/game-store-context';
import { SquashMinigameBody } from './components/squash-minigame-body';
import { SquashShellBooting } from './components/squash-shell-booting';
import type { UseAudioEffectsOptions } from './hooks/use-audio-effects';

export interface SquashMinigameProps {
  mode: GameMode;
  onExit?: () => void;
  /**
   * When set, the finished overlay can switch modes in place (overlay popup or settings launcher).
   * Picking the same mode as the current round starts a fresh run via the shell replay path.
   */
  onChangeMode?: (mode: GameMode) => void;
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

/**
 * Owns one game session: builds the vanilla store, drives the RAF loop, and renders the board.
 *
 * WHY [restart on mode change]: switching modes mid round is a fresh session, so the effect
 * disposes the previous store/loop and rebuilds. Phase 5 launchers always pass a fresh `mode`
 * per attempt, so this is the natural reset trigger.
 *
 * WHY [`replayToken` in deps]: "Try again" after `finished` bumps the token so the effect
 * rebuilds the store and loop without changing the `mode` prop.
 *
 * WHY [ref factories; mode + replayToken in effect deps]: keeps the default factories from churning the effect
 * and avoids a parent render loop when the caller's inject lambdas are not referentially stable.
 * The ref always points at the latest inject so a mode change still uses the current factory.
 */
export function SquashMinigame({
  mode,
  onExit,
  onChangeMode,
  onFinish,
  createStoreFn = defaultCreateStore,
  createLoopFn = defaultCreateLoop,
  audioOptions,
  disableFctOverlay = false,
}: SquashMinigameProps) {
  const [store, setStore] = useState<GameStore | null>(null);
  const [replayToken, setReplayToken] = useState(0);
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
  }, [mode, replayToken]);

  if (!store) {
    return <SquashShellBooting />;
  }

  return (
    <GameStoreProvider store={store}>
      <SquashMinigameBody
        mode={mode}
        onExit={onExit}
        onChangeMode={onChangeMode}
        onFinish={onFinish}
        onTryAgain={() => setReplayToken((n) => n + 1)}
        audioOptions={audioOptions}
        disableFctOverlay={disableFctOverlay}
      />
    </GameStoreProvider>
  );
}

export type { FinishedRoundSummary } from './game-types';
export { __resetLastFinishNotificationForTests } from './hooks/use-finished-reporter';
