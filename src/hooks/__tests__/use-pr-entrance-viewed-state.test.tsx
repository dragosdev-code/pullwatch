import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { PullRequest } from '@common/types';
import { usePrEntranceViewedState } from '../use-pr-entrance-viewed-state';

function makePr(id: string, overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id,
    url: `https://github.com/org/repo/pull/${id}`,
    title: 'Title',
    number: 1,
    repoName: 'org/repo',
    author: [{ login: 'alice' }],
    type: 'open',
    ...overrides,
  };
}

type HookProps = { assigned: PullRequest[]; merged: PullRequest[] };

describe('New PR entrance highlights', () => {
  it('highlights newly arrived assigned PRs until the user marks them seen', () => {
    const first = makePr('pr-1', { isNew: false });

    const { result, rerender } = renderHook(
      ({ assigned, merged }: HookProps) => usePrEntranceViewedState(assigned, merged),
      {
        initialProps: {
          assigned: [first],
          merged: [] as PullRequest[],
        },
      },
    );

    expect(result.current.assignedNewPrIds.size).toBe(0);

    const newcomer = makePr('pr-2', { isNew: true });
    rerender({ assigned: [first, newcomer], merged: [] });

    expect(result.current.assignedNewPrIds.has('pr-2')).toBe(true);

    act(() => {
      result.current.markViewedId('pr-2');
    });

    expect(result.current.assignedNewPrIds.has('pr-2')).toBe(false);
  });

  it('stops highlighting a merged PR after it is marked viewed', () => {
    const mergedNew = makePr('m-1', { type: 'merged', isNew: true });

    const { result, rerender } = renderHook(
      ({ assigned, merged }: HookProps) => usePrEntranceViewedState(assigned, merged),
      {
        initialProps: {
          assigned: [] as PullRequest[],
          merged: [mergedNew],
        },
      },
    );

    expect(result.current.mergedNewPrIds.has('m-1')).toBe(true);

    act(() => {
      result.current.markViewedId('m-1');
    });

    expect(result.current.mergedNewPrIds.has('m-1')).toBe(false);

    rerender({ assigned: [], merged: [mergedNew] });

    expect(result.current.mergedNewPrIds.has('m-1')).toBe(false);
  });
});
