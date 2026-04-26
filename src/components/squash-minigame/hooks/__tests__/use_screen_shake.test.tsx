import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useScreenShake } from '../use-screen-shake';
import { GameStoreProvider } from '../../context/game-store-context';
import { createGameStore, type GameStore } from '../../game-store';

function wrap(store: GameStore) {
  return ({ children }: { children: ReactNode }) => (
    <GameStoreProvider store={store}>{children}</GameStoreProvider>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useScreenShake', () => {
  it('returns false when shakeUntil is zero', () => {
    const store = createGameStore();
    store.getState().startGame('standard', 0);
    const { result } = renderHook(() => useScreenShake({ now: () => 100 }), {
      wrapper: wrap(store),
    });
    expect(result.current).toBe(false);
  });

  it('returns true when now is before shakeUntil and flips to false after the remaining ms elapse', () => {
    const store = createGameStore();
    store.getState().startGame('standard', 0);
    let nowValue = 100;
    const { result } = renderHook(() => useScreenShake({ now: () => nowValue }), {
      wrapper: wrap(store),
    });

    act(() => {
      store.setState({ shakeUntil: 400 });
    });

    expect(result.current).toBe(true);

    act(() => {
      nowValue = 410;
      vi.advanceTimersByTime(400);
    });

    expect(result.current).toBe(false);
  });

  it('returns false immediately when shakeUntil is in the past', () => {
    const store = createGameStore();
    store.getState().startGame('standard', 0);
    const { result } = renderHook(() => useScreenShake({ now: () => 1_000 }), {
      wrapper: wrap(store),
    });
    act(() => {
      store.setState({ shakeUntil: 500 });
    });
    expect(result.current).toBe(false);
  });

  it('replays the shake when shakeUntil bumps to a later value', () => {
    const store = createGameStore();
    store.getState().startGame('standard', 0);
    let nowValue = 0;
    const { result } = renderHook(() => useScreenShake({ now: () => nowValue }), {
      wrapper: wrap(store),
    });

    act(() => {
      store.setState({ shakeUntil: 300 });
    });
    expect(result.current).toBe(true);

    act(() => {
      nowValue = 350;
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe(false);

    act(() => {
      store.setState({ shakeUntil: 700 });
    });
    expect(result.current).toBe(true);
  });
});
