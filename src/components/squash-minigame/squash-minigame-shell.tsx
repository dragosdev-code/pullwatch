import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { createGameStore, type GameStore } from './game-store';
import { createGameLoop, type GameLoop } from './game-loop';
import type { GameMode } from './game-types';
import { GameStoreProvider, useGameStore } from './context/game-store-context';
import { GameBoard } from './components/game-board';
import { Hud } from './components/hud';

export interface SquashMinigameProps {
  mode: GameMode;
  onExit?: () => void;
  /**
   * Hooks for tests. Production callers omit these and the shell builds a real store and a real
   * RAF backed loop.
   */
  createStoreFn?: () => GameStore;
  createLoopFn?: (store: GameStore) => GameLoop;
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
  createStoreFn = defaultCreateStore,
  createLoopFn = defaultCreateLoop,
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
      <SquashMinigameBody onExit={onExit} />
    </GameStoreProvider>
  );
}

function SquashMinigameBody({ onExit }: { onExit?: () => void }) {
  return (
    <div className="flex w-full flex-col gap-3 p-3">
      <Hud />
      <GameBoard />
      <FinishedOverlay onExit={onExit} />
    </div>
  );
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
