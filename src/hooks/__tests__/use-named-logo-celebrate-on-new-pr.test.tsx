import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { PullRequest } from '../../../extension/common/types';
import { useNamedLogoCelebrateOnNewPr } from '../use-named-logo-celebrate-on-new-pr';

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

describe('useNamedLogoCelebrateOnNewPr', () => {
  it('does not bump on the first snapshot even when isNew ids are already present', () => {
    const { result } = renderHook(
      ({ assigned, merged }) => useNamedLogoCelebrateOnNewPr(assigned, merged),
      { initialProps: { assigned: [pr('a', true)], merged: [] as PullRequest[] } }
    );

    expect(result.current).toBe(0);
  });

  it('bumps when a new isNew id appears after baseline', () => {
    const { result, rerender } = renderHook(
      ({ assigned, merged }) => useNamedLogoCelebrateOnNewPr(assigned, merged),
      { initialProps: { assigned: [] as PullRequest[], merged: [] as PullRequest[] } }
    );

    expect(result.current).toBe(0);

    rerender({ assigned: [pr('x', true)], merged: [] });

    expect(result.current).toBe(1);
  });

  it('does not bump when the isNew set only shrinks', () => {
    const { result, rerender } = renderHook(
      ({ assigned, merged }) => useNamedLogoCelebrateOnNewPr(assigned, merged),
      {
        initialProps: {
          assigned: [pr('a', true), pr('b', true)],
          merged: [] as PullRequest[],
        },
      }
    );

    expect(result.current).toBe(0);

    rerender({ assigned: [pr('a', true)], merged: [] });

    expect(result.current).toBe(0);
  });

  it('bumps once when multiple new ids appear in the same update', () => {
    const { result, rerender } = renderHook(
      ({ assigned, merged }) => useNamedLogoCelebrateOnNewPr(assigned, merged),
      { initialProps: { assigned: [] as PullRequest[], merged: [] as PullRequest[] } }
    );

    rerender({
      assigned: [pr('a', true), pr('b', true)],
      merged: [],
    });

    expect(result.current).toBe(1);
  });

  it('considers merged list isNew ids', () => {
    const { result, rerender } = renderHook(
      ({ assigned, merged }) => useNamedLogoCelebrateOnNewPr(assigned, merged),
      { initialProps: { assigned: [] as PullRequest[], merged: [] as PullRequest[] } }
    );

    rerender({
      assigned: [],
      merged: [{ ...pr('m1', true), type: 'merged' }],
    });

    expect(result.current).toBe(1);
  });
});
