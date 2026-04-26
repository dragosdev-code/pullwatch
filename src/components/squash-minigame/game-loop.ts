import type { GameStore } from './game-store';

export interface GameLoopDeps {
  /** Wall clock used for the per frame `now` value passed into `store.tick`. */
  now?: () => number;
  /** Frame scheduler. Defaults to the global `requestAnimationFrame`. */
  requestFrame?: (cb: FrameRequestCallback) => number;
  /** Frame canceller paired with `requestFrame`. Defaults to the global `cancelAnimationFrame`. */
  cancelFrame?: (handle: number) => void;
}

export interface GameLoop {
  start(): void;
  stop(): void;
  isRunning(): boolean;
}

/**
 * Drives the supplied game store at the host display refresh rate.
 *
 * WHY [self stop on finished]: the store flips to status `finished` either when the timer drains
 * inside `tick` or when an external caller invokes `endGame`. Either way the next scheduled frame
 * detects the new status and stops requesting more frames, so callers do not need to chase
 * teardown.
 *
 * WHY [idempotent start and stop]: React effects in Phase 3 may invoke these in rapid succession
 * during StrictMode double mounts. Guarding on the handle keeps the loop single tracked.
 */
export function createGameLoop(store: GameStore, deps: GameLoopDeps = {}): GameLoop {
  const now = deps.now ?? (() => performance.now());
  const requestFrame =
    deps.requestFrame ?? ((cb: FrameRequestCallback) => globalThis.requestAnimationFrame(cb));
  const cancelFrame =
    deps.cancelFrame ?? ((handle: number) => globalThis.cancelAnimationFrame(handle));

  let handle: number | null = null;

  const tick = () => {
    handle = null;
    store.getState().tick(now());
    if (store.getState().status === 'playing') {
      handle = requestFrame(tick);
    }
  };

  return {
    start() {
      if (handle !== null) return;
      if (store.getState().status !== 'playing') return;
      handle = requestFrame(tick);
    },
    stop() {
      if (handle === null) return;
      cancelFrame(handle);
      handle = null;
    },
    isRunning() {
      return handle !== null;
    },
  };
}
