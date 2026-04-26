import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameLoop, type GameLoopDeps } from '../game-loop';
import { createGameStore, type GameStore } from '../game-store';

interface Harness {
  store: GameStore;
  loop: ReturnType<typeof createGameLoop>;
  requestFrame: ReturnType<typeof vi.fn>;
  cancelFrame: ReturnType<typeof vi.fn>;
  pendingCallbacks: FrameRequestCallback[];
  setNow: (next: number) => void;
  flushFrame: () => void;
}

function buildHarness(opts: { startingNow?: number } = {}): Harness {
  let currentNow = opts.startingNow ?? 1_000;
  const pendingCallbacks: FrameRequestCallback[] = [];

  let nextHandle = 1;
  const requestFrame = vi.fn((cb: FrameRequestCallback) => {
    pendingCallbacks.push(cb);
    const handle = nextHandle;
    nextHandle += 1;
    return handle;
  });
  const cancelFrame = vi.fn();

  const deps: GameLoopDeps = {
    now: () => currentNow,
    requestFrame,
    cancelFrame,
  };

  let seed = 0;
  const store = createGameStore({
    random: () => {
      seed = (seed + 0.1) % 1;
      return seed;
    },
    generateId: () => 'target_test',
  });

  const loop = createGameLoop(store, deps);

  return {
    store,
    loop,
    requestFrame,
    cancelFrame,
    pendingCallbacks,
    setNow(next) {
      currentNow = next;
    },
    flushFrame() {
      const cb = pendingCallbacks.shift();
      if (!cb) throw new Error('no frame pending');
      cb(currentNow);
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createGameLoop', () => {
  describe('start', () => {
    it('does nothing when status is idle', () => {
      const h = buildHarness();
      h.loop.start();
      expect(h.requestFrame).not.toHaveBeenCalled();
      expect(h.loop.isRunning()).toBe(false);
    });

    it('schedules a frame when status is playing', () => {
      const h = buildHarness();
      h.store.getState().startGame('standard', 1_000);
      h.loop.start();
      expect(h.requestFrame).toHaveBeenCalledTimes(1);
      expect(h.loop.isRunning()).toBe(true);
    });

    it('is idempotent when already running', () => {
      const h = buildHarness();
      h.store.getState().startGame('standard', 1_000);
      h.loop.start();
      h.loop.start();
      h.loop.start();
      expect(h.requestFrame).toHaveBeenCalledTimes(1);
    });
  });

  describe('frame execution', () => {
    it('invokes store.tick with the injected clock value', () => {
      const h = buildHarness({ startingNow: 1_000 });
      h.store.getState().startGame('standard', 1_000);
      const tickSpy = vi.spyOn(h.store.getState(), 'tick');
      h.loop.start();
      h.setNow(1_016);
      h.flushFrame();
      expect(tickSpy).toHaveBeenCalledWith(1_016);
    });

    it('schedules another frame after each tick while playing', () => {
      const h = buildHarness();
      h.store.getState().startGame('standard', 1_000);
      h.loop.start();
      expect(h.requestFrame).toHaveBeenCalledTimes(1);
      h.setNow(1_016);
      h.flushFrame();
      expect(h.requestFrame).toHaveBeenCalledTimes(2);
      h.setNow(1_032);
      h.flushFrame();
      expect(h.requestFrame).toHaveBeenCalledTimes(3);
    });

    it('self stops once the store reports finished', () => {
      const h = buildHarness({ startingNow: 1_000 });
      h.store.getState().startGame('standard', 1_000);
      h.loop.start();
      h.store.getState().endGame();
      h.flushFrame();
      expect(h.store.getState().status).toBe('finished');
      expect(h.requestFrame).toHaveBeenCalledTimes(1);
      expect(h.loop.isRunning()).toBe(false);
    });

    it('self stops when the store timer expires inside tick', () => {
      const h = buildHarness({ startingNow: 1_000 });
      h.store.getState().startGame('standard', 1_000);
      h.loop.start();
      h.setNow(1_000 + 30_000);
      h.flushFrame();
      expect(h.store.getState().status).toBe('finished');
      expect(h.loop.isRunning()).toBe(false);
      expect(h.requestFrame).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop', () => {
    it('cancels the pending frame handle', () => {
      const h = buildHarness();
      h.store.getState().startGame('standard', 1_000);
      h.loop.start();
      const handle = h.requestFrame.mock.results[0]?.value;
      h.loop.stop();
      expect(h.cancelFrame).toHaveBeenCalledWith(handle);
      expect(h.loop.isRunning()).toBe(false);
    });

    it('is a no op when not running', () => {
      const h = buildHarness();
      h.loop.stop();
      h.loop.stop();
      expect(h.cancelFrame).not.toHaveBeenCalled();
    });

    it('allows restart after stop', () => {
      const h = buildHarness();
      h.store.getState().startGame('standard', 1_000);
      h.loop.start();
      h.loop.stop();
      h.loop.start();
      expect(h.requestFrame).toHaveBeenCalledTimes(2);
      expect(h.loop.isRunning()).toBe(true);
    });
  });

  describe('default dependencies', () => {
    it('falls back to global requestAnimationFrame and performance.now when deps omitted', () => {
      const requestSpy = vi.fn().mockReturnValue(7);
      const cancelSpy = vi.fn();
      vi.stubGlobal('requestAnimationFrame', requestSpy);
      vi.stubGlobal('cancelAnimationFrame', cancelSpy);

      const store = createGameStore();
      store.getState().startGame('standard', 1_000);
      const loop = createGameLoop(store);
      loop.start();
      expect(requestSpy).toHaveBeenCalledTimes(1);
      loop.stop();
      expect(cancelSpy).toHaveBeenCalledWith(7);

      vi.unstubAllGlobals();
    });
  });
});
