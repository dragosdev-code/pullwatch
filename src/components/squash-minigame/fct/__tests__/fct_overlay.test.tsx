import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { FctOverlay } from '../fct-overlay';
import { createFctEngine } from '../fct-engine';
import { GameStoreProvider } from '../../context/game-store-context';
import { createGameStore } from '../../game-store';

interface FrameQueue {
  pending: FrameRequestCallback[];
  request: (cb: FrameRequestCallback) => number;
  cancel: (handle: number) => void;
  requestSpy: ReturnType<typeof vi.fn>;
  cancelSpy: ReturnType<typeof vi.fn>;
}

function buildFrameQueue(): FrameQueue {
  const pending: FrameRequestCallback[] = [];
  const requestSpy = vi.fn();
  const cancelSpy = vi.fn();
  const request = (cb: FrameRequestCallback) => {
    pending.push(cb);
    requestSpy(cb);
    return pending.length;
  };
  const cancel = (handle: number) => {
    cancelSpy(handle);
  };
  return { pending, request, cancel, requestSpy, cancelSpy };
}

let getContextSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeEach(() => {
  getContextSpy = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(
      () =>
        ({
          clearRect: vi.fn(),
          fillText: vi.fn(),
          globalAlpha: 1,
          fillStyle: '#000',
          font: '',
          textAlign: 'center',
          textBaseline: 'middle',
        }) as unknown as CanvasRenderingContext2D,
    );
});

afterEach(() => {
  getContextSpy?.mockRestore();
  vi.restoreAllMocks();
});

describe('FctOverlay', () => {
  it('renders a canvas with pointer events disabled so clicks fall through to the cells', () => {
    const store = createGameStore();
    store.getState().startGame('standard', 0);
    const queue = buildFrameQueue();
    const { getByTestId } = render(
      <GameStoreProvider store={store}>
        <FctOverlay
          engine={createFctEngine()}
          now={() => 1_000}
          requestFrame={queue.request}
          cancelFrame={queue.cancel}
        />
      </GameStoreProvider>,
    );
    const canvas = getByTestId('squash-fct-overlay');
    expect(canvas.tagName).toBe('CANVAS');
    expect(canvas.className).toContain('pointer-events-none');
  });

  it('spawns a particle when the store emits a new lastClick', () => {
    const store = createGameStore();
    store.getState().startGame('standard', 0);
    const engine = createFctEngine();
    const queue = buildFrameQueue();
    render(
      <GameStoreProvider store={store}>
        <FctOverlay
          engine={engine}
          now={() => 1_000}
          requestFrame={queue.request}
          cancelFrame={queue.cancel}
        />
      </GameStoreProvider>,
    );

    expect(engine.size()).toBe(0);

    act(() => {
      store.setState({
        lastClick: {
          id: 0,
          outcome: { kind: 'bug_squashed', points: 10, combo: 2 },
          cellIndex: 3,
          at: 500,
        },
        nextClickId: 1,
      });
    });

    expect(engine.size()).toBe(1);
  });

  it('schedules an animation frame on mount and cancels on unmount', () => {
    const store = createGameStore();
    store.getState().startGame('standard', 0);
    const queue = buildFrameQueue();
    const view = render(
      <GameStoreProvider store={store}>
        <FctOverlay
          engine={createFctEngine()}
          now={() => 1_000}
          requestFrame={queue.request}
          cancelFrame={queue.cancel}
        />
      </GameStoreProvider>,
    );
    expect(queue.requestSpy).toHaveBeenCalled();
    view.unmount();
    expect(queue.cancelSpy).toHaveBeenCalled();
  });

  it('keeps requesting subsequent frames after each draw cycle', () => {
    const store = createGameStore();
    store.getState().startGame('standard', 0);
    const queue = buildFrameQueue();
    render(
      <GameStoreProvider store={store}>
        <FctOverlay
          engine={createFctEngine()}
          now={() => 1_000}
          requestFrame={queue.request}
          cancelFrame={queue.cancel}
        />
      </GameStoreProvider>,
    );
    const initialCount = queue.requestSpy.mock.calls.length;
    const cb = queue.pending.shift();
    act(() => cb?.(0));
    expect(queue.requestSpy.mock.calls.length).toBe(initialCount + 1);
  });
});
