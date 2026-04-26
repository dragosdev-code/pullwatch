import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Hud } from '../components/hud';
import { GameStoreProvider } from '../context/game-store-context';
import { createGameStore } from '../game-store';

describe('Hud', () => {
  it('shows score, combo, and remaining seconds rounded up', () => {
    const store = createGameStore();
    store.getState().startGame('standard', 0);
    store.setState({ score: 42, combo: 3, timeRemainingMs: 12_400 });
    render(
      <GameStoreProvider store={store}>
        <Hud />
      </GameStoreProvider>
    );
    expect(screen.getByTestId('squash-hud-score').textContent).toBe('score 42');
    expect(screen.getByTestId('squash-hud-combo').textContent).toBe('x3');
    expect(screen.getByTestId('squash-hud-time').textContent).toBe('13s');
  });

  it('floors negative or zero remaining time to zero seconds', () => {
    const store = createGameStore();
    store.getState().startGame('standard', 0);
    store.setState({ timeRemainingMs: 0 });
    render(
      <GameStoreProvider store={store}>
        <Hud />
      </GameStoreProvider>
    );
    expect(screen.getByTestId('squash-hud-time').textContent).toBe('0s');
  });

  it('updates only the score node when only the score changes', () => {
    const store = createGameStore();
    store.getState().startGame('standard', 0);
    store.setState({ score: 10, combo: 1, timeRemainingMs: 5_000 });
    render(
      <GameStoreProvider store={store}>
        <Hud />
      </GameStoreProvider>
    );
    const scoreEl = screen.getByTestId('squash-hud-score');
    const comboEl = screen.getByTestId('squash-hud-combo');
    const timeEl = screen.getByTestId('squash-hud-time');

    act(() => {
      store.setState({ score: 20 });
    });

    expect(scoreEl.textContent).toBe('score 20');
    expect(comboEl.textContent).toBe('x1');
    expect(timeEl.textContent).toBe('5s');
  });
});
