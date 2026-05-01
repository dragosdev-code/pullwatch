import { useEffect, useRef, useState } from 'react';
import type { MinigameSessionCheckpoint } from '@common/types';
import { createGameStore, type GameStore } from './game-store';
import { createGameLoop, type GameLoop } from './game-loop';
import { buildCheckpointFromState } from './build-checkpoint';
import type { FinishCelebration, FinishedRoundSummary, GameMode } from './game-types';
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
  /** When the persisted round beat the prior per-mode high; overlay shows a banner when `roundId` matches. */
  finishCelebration?: FinishCelebration | null;
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
  /**
   * When set, the shell resumes from this checkpoint instead of starting a fresh round.
   * The checkpoint is consumed once; subsequent replays start fresh.
   */
  checkpoint?: MinigameSessionCheckpoint | null;
  /**
   * Called on unmount if the game is mid-round (`playing`). The provider persists the
   * returned checkpoint to chrome.storage.local so the next popup open can resume.
   */
  onSaveCheckpoint?: (cp: MinigameSessionCheckpoint) => void;
  /**
   * Called when the round finishes normally so the checkpoint is cleared from storage.
   */
  onClearCheckpoint?: () => void;
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
  checkpoint = null,
  onSaveCheckpoint,
  onClearCheckpoint,
  finishCelebration = null,
}: SquashMinigameProps) {
  const [store, setStore] = useState<GameStore | null>(null);
  const [replayToken, setReplayToken] = useState(0);
  const createStoreRef = useRef(createStoreFn);
  const createLoopRef = useRef(createLoopFn);
  const onSaveCheckpointRef = useRef(onSaveCheckpoint);
  const onClearCheckpointRef = useRef(onClearCheckpoint);
  createStoreRef.current = createStoreFn;
  createLoopRef.current = createLoopFn;
  onSaveCheckpointRef.current = onSaveCheckpoint;
  onClearCheckpointRef.current = onClearCheckpoint;

  /** Consumed once on the first mount when a checkpoint is provided. */
  const checkpointRef = useRef(checkpoint);
  const checkpointConsumedRef = useRef(false);

  useEffect(() => {
    const buildStore = createStoreRef.current;
    const buildLoop = createLoopRef.current;
    const nextStore = buildStore();
    const nextLoop = buildLoop(nextStore);
    setStore(nextStore);

    const cp = checkpointRef.current;
    if (cp && !checkpointConsumedRef.current) {
      checkpointConsumedRef.current = true;
      nextStore.getState().resumeFromCheckpoint(cp, performance.now());
    } else {
      nextStore.getState().startGame(mode, performance.now());
    }
    nextLoop.start();

    /**
     * WHY [periodic save, not just unmount]: `chrome.storage.local.set` is async. When the
     * popup closes abruptly (user clicks outside, presses Escape), the JS context is destroyed
     * before the effect cleanup's async write can complete. By saving every 3 seconds, storage
     * always has a recent checkpoint regardless of how the popup exits.
     *
     * The 3s cadence is a balance: frequent enough that losing at most 3s of progress is
     * acceptable, rare enough that it doesn't hammer chrome.storage during gameplay.
     */
    const CHECKPOINT_SAVE_INTERVAL_MS = 3_000;
    const saveInterval = setInterval(() => {
      const state = nextStore.getState();
      if (state.status === 'playing') {
        const snap = buildCheckpointFromState(state, Date.now());
        if (snap) {
          onSaveCheckpointRef.current?.(snap);
        }
      }
    }, CHECKPOINT_SAVE_INTERVAL_MS);

    /**
     * WHY [clear on finish]: when the round ends normally, remove the checkpoint so the next
     * popup open doesn't show the paused overlay for a completed game.
     */
    const unsubscribe = nextStore.subscribe((state) => {
      if (state.status === 'finished') {
        onClearCheckpointRef.current?.();
      }
    });

    return () => {
      clearInterval(saveInterval);
      unsubscribe();
      nextLoop.stop();
      // Best-effort last-second save (may not complete if popup is closing).
      const state = nextStore.getState();
      if (state.status === 'playing') {
        const snap = buildCheckpointFromState(state, Date.now());
        if (snap) {
          onSaveCheckpointRef.current?.(snap);
        }
      }
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
        finishCelebration={finishCelebration}
      />
    </GameStoreProvider>
  );
}

export type { FinishCelebration, FinishedRoundSummary } from './game-types';
export { __resetLastFinishNotificationForTests } from './hooks/use-finished-reporter';
