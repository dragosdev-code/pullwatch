import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useAudioEffects } from '../use-audio-effects';
import { GameStoreProvider } from '../../context/game-store-context';
import { createGameStore, type GameStore } from '../../game-store';
import type { AudioEngine } from '../../audio/audio-engine';

function wrap(store: GameStore) {
  return ({ children }: { children: ReactNode }) => (
    <GameStoreProvider store={store}>{children}</GameStoreProvider>
  );
}

function buildEngineStub(): AudioEngine & {
  playSpy: ReturnType<typeof vi.fn>;
  closeSpy: ReturnType<typeof vi.fn>;
} {
  const playSpy = vi.fn();
  const closeSpy = vi.fn();
  return {
    playOutcome: playSpy,
    close: closeSpy,
    playSpy,
    closeSpy,
  };
}

describe('useAudioEffects', () => {
  it('plays the engine on each new lastClick using the outcome combo for bug squashes', () => {
    const store = createGameStore();
    store.getState().startGame('standard', 0);
    const engine = buildEngineStub();

    renderHook(() => useAudioEffects({ engine }), { wrapper: wrap(store) });

    act(() => {
      store.setState({
        combo: 3,
        lastClick: {
          id: 0,
          outcome: { kind: 'bug_squashed', points: 10, combo: 3 },
          cellIndex: 0,
          at: 100,
        },
        nextClickId: 1,
      });
    });

    expect(engine.playSpy).toHaveBeenCalledTimes(1);
    expect(engine.playSpy).toHaveBeenCalledWith({ kind: 'bug_squashed', points: 10, combo: 3 }, 3);
  });

  it('falls back to the live combo for non bug squash outcomes', () => {
    const store = createGameStore();
    store.getState().startGame('standard', 0);
    const engine = buildEngineStub();
    renderHook(() => useAudioEffects({ engine }), { wrapper: wrap(store) });

    act(() => {
      store.setState({
        combo: 5,
        lastClick: {
          id: 0,
          outcome: { kind: 'feature_broken', points: -20 },
          cellIndex: 0,
          at: 200,
        },
        nextClickId: 1,
      });
    });

    expect(engine.playSpy).toHaveBeenCalledWith({ kind: 'feature_broken', points: -20 }, 5);
  });

  it('does not replay when the same lastClick is observed twice', () => {
    const store = createGameStore();
    store.getState().startGame('standard', 0);
    const engine = buildEngineStub();
    renderHook(() => useAudioEffects({ engine }), { wrapper: wrap(store) });

    const click = {
      id: 0,
      outcome: { kind: 'miss' as const },
      cellIndex: 0,
      at: 50,
    };
    act(() => {
      store.setState({ lastClick: click, nextClickId: 1 });
    });
    act(() => {
      store.setState({ lastClick: click, nextClickId: 1 });
    });

    expect(engine.playSpy).toHaveBeenCalledTimes(1);
  });

  it('closes the engine on unmount', () => {
    const store = createGameStore();
    store.getState().startGame('standard', 0);
    const engine = buildEngineStub();
    const view = renderHook(() => useAudioEffects({ engine }), { wrapper: wrap(store) });
    view.unmount();
    expect(engine.closeSpy).toHaveBeenCalledTimes(1);
  });
});
