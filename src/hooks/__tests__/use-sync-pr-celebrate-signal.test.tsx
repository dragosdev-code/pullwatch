import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { PullRequest } from '@common/types';
import { usePrCelebrateSignalStore } from '@src/stores/pr-celebrate-signal';
import { useSyncPrCelebrateSignal } from '../use-sync-pr-celebrate-signal';

const pr = (id: string, isNew: boolean): PullRequest => ({
  id,
  url: `https://github.com/o/r/pull/${id}`,
  title: 't',
  number: 1,
  repoName: 'o/r',
  author: [],
  type: 'open',
  isNew,
});

describe('useSyncPrCelebrateSignal', () => {
  beforeEach(() => {
    usePrCelebrateSignalStore.setState({ signal: 0 });
  });

  it('does not bump on the first snapshot even when isNew ids are already present', () => {
    renderHook(
      ({ assigned, merged }) => {
        useSyncPrCelebrateSignal(assigned, merged);
        return usePrCelebrateSignalStore((s) => s.signal);
      },
      { initialProps: { assigned: [pr('a', true)], merged: [] as PullRequest[] } }
    );

    expect(usePrCelebrateSignalStore.getState().signal).toBe(0);
  });

  it('bumps when a new isNew id appears after baseline', () => {
    const { rerender } = renderHook(
      ({ assigned, merged }) => {
        useSyncPrCelebrateSignal(assigned, merged);
        return usePrCelebrateSignalStore((s) => s.signal);
      },
      { initialProps: { assigned: [] as PullRequest[], merged: [] as PullRequest[] } }
    );

    expect(usePrCelebrateSignalStore.getState().signal).toBe(0);

    rerender({ assigned: [pr('x', true)], merged: [] });

    expect(usePrCelebrateSignalStore.getState().signal).toBe(1);
  });

  it('does not bump when the isNew set only shrinks', () => {
    const { rerender } = renderHook(
      ({ assigned, merged }) => {
        useSyncPrCelebrateSignal(assigned, merged);
        return usePrCelebrateSignalStore((s) => s.signal);
      },
      {
        initialProps: {
          assigned: [pr('a', true), pr('b', true)],
          merged: [] as PullRequest[],
        },
      }
    );

    expect(usePrCelebrateSignalStore.getState().signal).toBe(0);

    rerender({ assigned: [pr('a', true)], merged: [] });

    expect(usePrCelebrateSignalStore.getState().signal).toBe(0);
  });

  it('bumps once when multiple new ids appear in the same update', () => {
    const { rerender } = renderHook(
      ({ assigned, merged }) => {
        useSyncPrCelebrateSignal(assigned, merged);
        return usePrCelebrateSignalStore((s) => s.signal);
      },
      { initialProps: { assigned: [] as PullRequest[], merged: [] as PullRequest[] } }
    );

    rerender({
      assigned: [pr('a', true), pr('b', true)],
      merged: [],
    });

    expect(usePrCelebrateSignalStore.getState().signal).toBe(1);
  });

  it('considers merged list isNew ids', () => {
    const { rerender } = renderHook(
      ({ assigned, merged }) => {
        useSyncPrCelebrateSignal(assigned, merged);
        return usePrCelebrateSignalStore((s) => s.signal);
      },
      { initialProps: { assigned: [] as PullRequest[], merged: [] as PullRequest[] } }
    );

    rerender({
      assigned: [],
      merged: [{ ...pr('m1', true), type: 'merged' }],
    });

    expect(usePrCelebrateSignalStore.getState().signal).toBe(1);
  });
});
