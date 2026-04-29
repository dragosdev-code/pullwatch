import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Cell } from '../components/cell';
import { GameStoreProvider } from '../context/game-store-context';
import { createGameStore, type GameStore } from '../game-store';
import type { Target } from '../game-types';

function buildStore(): GameStore {
  let counter = 0;
  return createGameStore({
    random: () => 0,
    generateId: () => {
      counter += 1;
      return `t_${counter}`;
    },
  });
}

function placeTarget(store: GameStore, index: number, target: Target | null) {
  store.setState((s) => {
    const next = s.activeTargets.slice();
    next[index] = target;
    return { activeTargets: next };
  });
}

function makeBug(damageStage = 0): Target {
  return {
    id: 'bug_1',
    kind: 'bug',
    spawnedAt: 0,
    despawnAt: 10_000,
    damageStage,
  };
}

function makeFeature(): Target {
  return {
    id: 'feat_1',
    kind: 'feature',
    spawnedAt: 0,
    despawnAt: 10_000,
    damageStage: 0,
  };
}

beforeEach(() => {
  vi.spyOn(performance, 'now').mockReturnValue(5_000);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Cell', () => {
  it('renders empty when its slot is null', () => {
    const store = buildStore();
    render(
      <GameStoreProvider store={store}>
        <Cell index={0} />
      </GameStoreProvider>
    );
    const cell = screen.getByTestId('squash-cell-0');
    expect(cell.dataset.targetKind).toBe('empty');
    expect(cell.textContent).toBe('');
  });

  it('renders bug glyph when its slot holds a bug', () => {
    const store = buildStore();
    store.getState().startGame('standard', 0);
    placeTarget(store, 2, makeBug());
    render(
      <GameStoreProvider store={store}>
        <Cell index={2} />
      </GameStoreProvider>
    );
    const cell = screen.getByTestId('squash-cell-2');
    expect(cell.dataset.targetKind).toBe('bug');
    expect(cell.dataset.targetDamage).toBe('0');
    expect(cell.textContent).toContain('bug');
  });

  it('shows the cracked variant for damaged legacy bugs', () => {
    const store = buildStore();
    store.getState().startGame('legacy', 0);
    placeTarget(store, 1, makeBug(1));
    render(
      <GameStoreProvider store={store}>
        <Cell index={1} />
      </GameStoreProvider>
    );
    const cell = screen.getByTestId('squash-cell-1');
    expect(cell.dataset.targetDamage).toBe('1');
    expect(cell.getAttribute('aria-label')).toContain('cracked bug');
  });

  it('renders feature glyph for feature targets', () => {
    const store = buildStore();
    store.getState().startGame('standard', 0);
    placeTarget(store, 0, makeFeature());
    render(
      <GameStoreProvider store={store}>
        <Cell index={0} />
      </GameStoreProvider>
    );
    const cell = screen.getByTestId('squash-cell-0');
    expect(cell.dataset.targetKind).toBe('feature');
    expect(cell.textContent).toContain('feat');
  });

  it('invokes clickCell on the store with current performance.now', () => {
    const store = buildStore();
    store.getState().startGame('standard', 0);
    placeTarget(store, 4, makeBug());
    const spy = vi.spyOn(store.getState(), 'clickCell');
    render(
      <GameStoreProvider store={store}>
        <Cell index={4} />
      </GameStoreProvider>
    );
    fireEvent.click(screen.getByTestId('squash-cell-4'));
    expect(spy).toHaveBeenCalledWith(4, 5_000);
  });

  it('invokes clickCell once on primary pointerDown then pointerUp', () => {
    const store = buildStore();
    store.getState().startGame('standard', 0);
    placeTarget(store, 4, makeBug());
    const spy = vi.spyOn(store.getState(), 'clickCell');
    render(
      <GameStoreProvider store={store}>
        <Cell index={4} />
      </GameStoreProvider>
    );
    const cell = screen.getByTestId('squash-cell-4');
    fireEvent.pointerDown(cell, {
      pointerId: 1,
      button: 0,
      buttons: 1,
      isPrimary: true,
      pointerType: 'mouse',
    });
    fireEvent.pointerUp(cell, {
      pointerId: 1,
      button: 0,
      buttons: 0,
      isPrimary: true,
      pointerType: 'mouse',
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(4, 5_000);
  });

  it('does not re render when an unrelated cell slot mutates', () => {
    const store = buildStore();
    store.getState().startGame('standard', 0);

    let renderCount = 0;
    function Counter({ index }: { index: number }) {
      renderCount += 1;
      return <Cell index={index} />;
    }

    render(
      <GameStoreProvider store={store}>
        <Counter index={0} />
      </GameStoreProvider>
    );

    const initialRenders = renderCount;
    placeTarget(store, 5, makeBug());
    expect(renderCount).toBe(initialRenders);
  });

  it('throws a clear error when used outside the provider', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Cell index={0} />)).toThrow(/GameStoreProvider/);
    errorSpy.mockRestore();
  });
});
