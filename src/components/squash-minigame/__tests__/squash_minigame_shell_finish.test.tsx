import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import { SquashMinigame, __resetLastFinishNotificationForTests } from '../squash-minigame-shell';
import { createGameStore, __resetSessionRoundIdForTests } from '../game-store';
import type { GameLoop } from '../game-loop';

function noopLoop(): GameLoop {
  return {
    start: () => {},
    stop: () => {},
    isRunning: () => false,
  };
}

beforeEach(() => {
  vi.spyOn(performance, 'now').mockReturnValue(1_000);
  __resetSessionRoundIdForTests();
  __resetLastFinishNotificationForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SquashMinigame onFinish reporter', () => {
  it('fires onFinish exactly once with the final summary when the game ends', () => {
    const store = createGameStore();
    const onFinish = vi.fn();

    render(
      <SquashMinigame
        mode="standard"
        onFinish={onFinish}
        createStoreFn={() => store}
        createLoopFn={() => noopLoop()}
      />
    );

    act(() => {
      store.setState({
        status: 'finished',
        score: 110,
        highestCombo: 6,
        bugsSquashed: 11,
        featuresBroken: 1,
        elapsedMs: 30_400,
      });
    });

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith({
      mode: 'standard',
      roundId: 1,
      score: 110,
      highestCombo: 6,
      bugsSquashed: 11,
      featuresBroken: 1,
      durationSeconds: 30,
    });
  });

  it('does not fire onFinish while the game is still playing', () => {
    const store = createGameStore();
    const onFinish = vi.fn();
    render(
      <SquashMinigame
        mode="standard"
        onFinish={onFinish}
        createStoreFn={() => store}
        createLoopFn={() => noopLoop()}
      />
    );
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('does not double fire when the finished state is observed multiple times', () => {
    const store = createGameStore();
    const onFinish = vi.fn();
    render(
      <SquashMinigame
        mode="legacy"
        onFinish={onFinish}
        createStoreFn={() => store}
        createLoopFn={() => noopLoop()}
      />
    );
    act(() => {
      store.setState({ status: 'finished', score: 30, elapsedMs: 30_000 });
    });
    act(() => {
      store.setState({ score: 30 });
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('shows the new-best banner when finishCelebration matches the finished roundId', () => {
    const store = createGameStore();
    const onFinish = vi.fn();

    render(
      <SquashMinigame
        mode="standard"
        onFinish={onFinish}
        finishCelebration={{ roundId: 1, isNewHighScore: true, previousHighScore: 100 }}
        createStoreFn={() => store}
        createLoopFn={() => noopLoop()}
      />
    );

    act(() => {
      store.setState({
        status: 'finished',
        score: 200,
        highestCombo: 6,
        bugsSquashed: 11,
        featuresBroken: 1,
        elapsedMs: 30_400,
      });
    });

    expect(screen.getByTestId('squash-finished-new-best-banner').textContent).toContain('New best score!');
    expect(screen.getByTestId('squash-finished-score-runway')).toBeTruthy();
    expect(screen.getByTestId('squash-finished-score-delta').textContent).toContain('past your previous best');
  });

  it('renders score runway with gap copy when below previous best', () => {
    const store = createGameStore();
    const onFinish = vi.fn();

    render(
      <SquashMinigame
        mode="standard"
        onFinish={onFinish}
        finishCelebration={{ roundId: 1, isNewHighScore: false, previousHighScore: 200 }}
        createStoreFn={() => store}
        createLoopFn={() => noopLoop()}
      />
    );

    act(() => {
      store.setState({
        status: 'finished',
        score: 150,
        highestCombo: 2,
        bugsSquashed: 3,
        featuresBroken: 0,
        elapsedMs: 20_000,
      });
    });

    expect(screen.getByTestId('squash-finished-score-runway')).toBeTruthy();
    expect(screen.getByTestId('squash-finished-score-delta').textContent).toContain('to beat your record');
    expect(screen.queryByTestId('squash-finished-score')).toBeNull();
  });

  it('does not show the new-best banner when finishCelebration roundId does not match', () => {
    const store = createGameStore();
    const onFinish = vi.fn();

    render(
      <SquashMinigame
        mode="standard"
        onFinish={onFinish}
        finishCelebration={{ roundId: 99, isNewHighScore: true, previousHighScore: 0 }}
        createStoreFn={() => store}
        createLoopFn={() => noopLoop()}
      />
    );

    act(() => {
      store.setState({
        status: 'finished',
        score: 200,
        highestCombo: 6,
        bugsSquashed: 11,
        featuresBroken: 1,
        elapsedMs: 30_400,
      });
    });

    expect(screen.queryByTestId('squash-finished-new-best-banner')).toBeNull();
  });
});
