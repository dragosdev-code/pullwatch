import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GameBoard } from '../components/game-board';
import { GameStoreProvider } from '../context/game-store-context';
import { createGameStore, type GameStore } from '../game-store';

function buildStore(): GameStore {
  return createGameStore({ random: () => 0, generateId: () => 'id' });
}

describe('GameBoard', () => {
  it('renders one cell per slot for the current grid size', () => {
    const store = buildStore();
    store.getState().startGame('standard', 0);
    render(
      <GameStoreProvider store={store}>
        <GameBoard />
      </GameStoreProvider>
    );
    const board = screen.getByTestId('squash-game-board');
    expect(board.dataset.gridSize).toBe('3');
    const cells = screen.getAllByTestId(/^squash-cell-/);
    expect(cells).toHaveLength(9);
  });

  it('grows the cell grid when the store reports a larger grid size', () => {
    const store = buildStore();
    store.getState().startGame('scopeCreep', 0);
    const view = render(
      <GameStoreProvider store={store}>
        <GameBoard />
      </GameStoreProvider>
    );
    expect(screen.getAllByTestId(/^squash-cell-/)).toHaveLength(9);

    store.setState({
      gridSize: 4,
      activeTargets: new Array(16).fill(null),
    });
    view.rerender(
      <GameStoreProvider store={store}>
        <GameBoard />
      </GameStoreProvider>
    );

    expect(screen.getByTestId('squash-game-board').dataset.gridSize).toBe('4');
    expect(screen.getAllByTestId(/^squash-cell-/)).toHaveLength(16);
  });
});
