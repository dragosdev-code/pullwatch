import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { SquashMinigame } from '../squash-minigame-shell';
import { FINISHED_OVERLAY_ACTION_DELAY_MS } from '../game-config';
import { createGameStore } from '../game-store';
import type { GameLoop } from '../game-loop';

interface BuiltLoop {
  loop: GameLoop;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
}

function buildLoop(): BuiltLoop {
  const start = vi.fn();
  const stop = vi.fn();
  let running = false;
  const loop: GameLoop = {
    start: () => {
      running = true;
      start();
    },
    stop: () => {
      running = false;
      stop();
    },
    isRunning: () => running,
  };
  return { loop, start, stop };
}

beforeEach(() => {
  vi.spyOn(performance, 'now').mockReturnValue(2_500);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SquashMinigame shell', () => {
  it('builds a store, starts the requested mode, and starts the loop on mount', () => {
    const store = createGameStore({ random: () => 0, generateId: () => 'x' });
    const startSpy = vi.spyOn(store.getState(), 'startGame');
    const built = buildLoop();

    render(
      <SquashMinigame
        mode="fridayDeploy"
        createStoreFn={() => store}
        createLoopFn={() => built.loop}
      />
    );

    expect(startSpy).toHaveBeenCalledWith('fridayDeploy', 2_500);
    expect(built.start).toHaveBeenCalledTimes(1);
    expect(store.getState().status).toBe('playing');
    expect(store.getState().mode).toBe('fridayDeploy');
  });

  it('renders the HUD and the board with the mode initial grid size', () => {
    const store = createGameStore();
    const built = buildLoop();
    render(
      <SquashMinigame mode="standard" createStoreFn={() => store} createLoopFn={() => built.loop} />
    );
    expect(screen.getByTestId('squash-game-board').dataset.gridSize).toBe('3');
    expect(screen.getByTestId('squash-hud-score').textContent).toBe('score 0');
  });

  it('stops the loop and resets the store when unmounted', () => {
    const store = createGameStore();
    const resetSpy = vi.spyOn(store.getState(), 'reset');
    const built = buildLoop();
    const view = render(
      <SquashMinigame mode="standard" createStoreFn={() => store} createLoopFn={() => built.loop} />
    );

    view.unmount();

    expect(built.stop).toHaveBeenCalledTimes(1);
    expect(resetSpy).toHaveBeenCalledTimes(1);
  });

  it('rebuilds store and loop when the mode prop changes', () => {
    const storeA = createGameStore();
    const storeB = createGameStore();
    const builtA = buildLoop();
    const builtB = buildLoop();

    let createStoreCalls = 0;
    const createStoreFn = () => {
      createStoreCalls += 1;
      return createStoreCalls === 1 ? storeA : storeB;
    };
    let createLoopCalls = 0;
    const createLoopFn = () => {
      createLoopCalls += 1;
      return createLoopCalls === 1 ? builtA.loop : builtB.loop;
    };

    const view = render(
      <SquashMinigame mode="standard" createStoreFn={createStoreFn} createLoopFn={createLoopFn} />
    );
    expect(builtA.start).toHaveBeenCalledTimes(1);

    view.rerender(
      <SquashMinigame mode="legacy" createStoreFn={createStoreFn} createLoopFn={createLoopFn} />
    );

    expect(builtA.stop).toHaveBeenCalledTimes(1);
    expect(builtB.start).toHaveBeenCalledTimes(1);
    expect(storeB.getState().mode).toBe('legacy');
  });

  it('shows the finished overlay with summary stats once status flips', () => {
    const store = createGameStore();
    const built = buildLoop();
    render(
      <SquashMinigame mode="standard" createStoreFn={() => store} createLoopFn={() => built.loop} />
    );

    act(() => {
      store.setState({
        status: 'finished',
        score: 90,
        highestCombo: 4,
        bugsSquashed: 9,
        featuresBroken: 1,
      });
    });

    expect(screen.getByTestId('squash-finished-overlay')).toBeTruthy();
    expect(screen.getByTestId('squash-finished-score').textContent).toContain('90');
    expect(screen.getByTestId('squash-finished-combo').textContent).toContain('4');
    expect(screen.getByTestId('squash-finished-bugs').textContent).toContain('9');
    expect(screen.getByTestId('squash-finished-features').textContent).toContain('1');
  });

  describe('finished overlay action delay', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('does not render primary actions until the delay elapses', () => {
      const store = createGameStore();
      const built = buildLoop();
      render(
        <SquashMinigame mode="standard" createStoreFn={() => store} createLoopFn={() => built.loop} />
      );

      act(() => {
        store.setState({ status: 'finished', score: 1, highestCombo: 1, bugsSquashed: 1, featuresBroken: 0 });
      });

      expect(screen.getByTestId('squash-finished-actions-pending')).toBeTruthy();
      expect(screen.queryByTestId('squash-finished-try-again')).toBeNull();

      act(() => {
        vi.advanceTimersByTime(FINISHED_OVERLAY_ACTION_DELAY_MS);
      });

      expect(screen.queryByTestId('squash-finished-actions-pending')).toBeNull();
      expect(screen.getByTestId('squash-finished-try-again')).toBeTruthy();
    });

    it('invokes onExit when the exit button is clicked from the finished overlay', () => {
      const store = createGameStore();
      const built = buildLoop();
      const onExit = vi.fn();
      render(
        <SquashMinigame
          mode="standard"
          onExit={onExit}
          createStoreFn={() => store}
          createLoopFn={() => built.loop}
        />
      );
      act(() => {
        store.setState({ status: 'finished' });
      });

      act(() => {
        vi.advanceTimersByTime(FINISHED_OVERLAY_ACTION_DELAY_MS);
      });

      fireEvent.click(screen.getByTestId('squash-finished-exit'));
      expect(onExit).toHaveBeenCalledTimes(1);
    });

    it('Try again restarts the round and hides the finished overlay', () => {
      const store = createGameStore();
      const built = buildLoop();
      render(
        <SquashMinigame mode="standard" createStoreFn={() => store} createLoopFn={() => built.loop} />
      );
      act(() => {
        store.setState({
          status: 'finished',
          score: 1,
          highestCombo: 1,
          bugsSquashed: 1,
          featuresBroken: 0,
        });
      });
      expect(screen.getByTestId('squash-finished-overlay')).toBeTruthy();

      act(() => {
        vi.advanceTimersByTime(FINISHED_OVERLAY_ACTION_DELAY_MS);
      });

      fireEvent.click(screen.getByTestId('squash-finished-try-again'));
      expect(screen.queryByTestId('squash-finished-overlay')).toBeNull();
      expect(store.getState().status).toBe('playing');
    });

    it('calls onChangeMode when a different mode is picked from the finished overlay', () => {
      const store = createGameStore();
      const built = buildLoop();
      const onChangeMode = vi.fn();
      render(
        <SquashMinigame
          mode="standard"
          onChangeMode={onChangeMode}
          createStoreFn={() => store}
          createLoopFn={() => built.loop}
        />
      );
      act(() => {
        store.setState({ status: 'finished' });
      });

      act(() => {
        vi.advanceTimersByTime(FINISHED_OVERLAY_ACTION_DELAY_MS);
      });

      fireEvent.click(screen.getByTestId('squash-finished-change-mode'));
      fireEvent.click(screen.getByTestId('squash-finished-mode-option-legacy'));
      fireEvent.click(screen.getByTestId('squash-finished-mode-play'));
      expect(onChangeMode).toHaveBeenCalledWith('legacy');
    });

    it('picking the same mode in the overlay acts like try again', () => {
      const store = createGameStore();
      const built = buildLoop();
      const onChangeMode = vi.fn();
      render(
        <SquashMinigame
          mode="standard"
          onChangeMode={onChangeMode}
          createStoreFn={() => store}
          createLoopFn={() => built.loop}
        />
      );
      act(() => {
        store.setState({ status: 'finished' });
      });

      act(() => {
        vi.advanceTimersByTime(FINISHED_OVERLAY_ACTION_DELAY_MS);
      });

      fireEvent.click(screen.getByTestId('squash-finished-change-mode'));
      fireEvent.click(screen.getByTestId('squash-finished-mode-option-standard'));
      fireEvent.click(screen.getByTestId('squash-finished-mode-play'));
      expect(onChangeMode).not.toHaveBeenCalled();
      expect(screen.queryByTestId('squash-finished-overlay')).toBeNull();
      expect(store.getState().status).toBe('playing');
    });
  });

  it('hides the finished overlay while still playing', () => {
    const store = createGameStore();
    const built = buildLoop();
    render(
      <SquashMinigame mode="standard" createStoreFn={() => store} createLoopFn={() => built.loop} />
    );
    expect(screen.queryByTestId('squash-finished-overlay')).toBeNull();
  });

  it('hides the exit button when no onExit handler is provided', () => {
    const store = createGameStore();
    const built = buildLoop();
    render(
      <SquashMinigame mode="standard" createStoreFn={() => store} createLoopFn={() => built.loop} />
    );
    act(() => {
      store.setState({ status: 'finished' });
    });
    expect(screen.queryByTestId('squash-finished-exit')).toBeNull();
  });

  it('does not render change-mode when onChangeMode is omitted', () => {
    const store = createGameStore();
    const built = buildLoop();
    render(
      <SquashMinigame mode="standard" createStoreFn={() => store} createLoopFn={() => built.loop} />
    );
    act(() => {
      store.setState({ status: 'finished' });
    });
    expect(screen.queryByTestId('squash-finished-change-mode')).toBeNull();
  });
});
