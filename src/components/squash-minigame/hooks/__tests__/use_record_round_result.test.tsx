import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const readMock = vi.hoisted(() => vi.fn());
const writeMock = vi.hoisted(() => vi.fn());

vi.mock('../../storage/minigame-stats-storage', () => ({
  readMinigameStats: readMock,
  writeMinigameStats: writeMock,
}));

import {
  useRecordRoundResult,
  __resetRoundResultPersistingForTests,
} from '../use-record-round-result';
import { ensureCompleteMinigameStats } from '../../storage/minigame-stats-defaults';

beforeEach(() => {
  readMock.mockReset();
  writeMock.mockReset();
  writeMock.mockResolvedValue(undefined);
  __resetRoundResultPersistingForTests();
});

describe('useRecordRoundResult', () => {
  it('reads current stats, applies the round, and writes the merged value', async () => {
    readMock.mockResolvedValueOnce(ensureCompleteMinigameStats(undefined));
    const { result } = renderHook(() => useRecordRoundResult());

    await act(async () => {
      const meta = await result.current({
        roundId: 1,
        mode: 'standard',
        score: 50,
        highestCombo: 3,
        bugsSquashed: 5,
        featuresBroken: 0,
        durationSeconds: 30,
      });
      expect(meta).toEqual({ isNewHighScore: true });
    });

    expect(readMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledTimes(1);
    const written = writeMock.mock.calls[0][0];
    expect(written.modes.standard.playCount).toBe(1);
    expect(written.modes.standard.highScore).toBe(50);
    expect(written.lastPlayedMode).toBe('standard');
  });

  it('swallows storage errors so the launcher UI is not broken by a failed write', async () => {
    readMock.mockRejectedValueOnce(new Error('quota'));
    const { result } = renderHook(() => useRecordRoundResult());
    let meta: Awaited<ReturnType<ReturnType<typeof useRecordRoundResult>>> | undefined;
    await act(async () => {
      meta = await result.current({
        roundId: 2,
        mode: 'standard',
        score: 0,
        highestCombo: 0,
        bugsSquashed: 0,
        featuresBroken: 0,
        durationSeconds: 0,
      });
    });
    expect(meta).toBeUndefined();
    expect(writeMock).not.toHaveBeenCalled();
  });

  it('skips a duplicate concurrent invocation with the same roundId', async () => {
    let resolveRead: ((v: unknown) => void) | null = null;
    readMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        })
    );
    const { result } = renderHook(() => useRecordRoundResult());

    let firstDone = false;
    let secondDone = false;
    let firstMeta: Awaited<ReturnType<ReturnType<typeof useRecordRoundResult>>> | undefined;
    let secondMeta: Awaited<ReturnType<ReturnType<typeof useRecordRoundResult>>> | undefined;
    await act(async () => {
      const p1 = result
        .current({
          roundId: 3,
          mode: 'standard',
          score: 0,
          highestCombo: 0,
          bugsSquashed: 0,
          featuresBroken: 0,
          durationSeconds: 0,
        })
        .then((m) => {
          firstMeta = m;
          firstDone = true;
        });
      const p2 = result
        .current({
          roundId: 3,
          mode: 'standard',
          score: 0,
          highestCombo: 0,
          bugsSquashed: 0,
          featuresBroken: 0,
          durationSeconds: 0,
        })
        .then((m) => {
          secondMeta = m;
          secondDone = true;
        });
      resolveRead?.(ensureCompleteMinigameStats(undefined));
      await Promise.all([p1, p2]);
    });

    expect(firstDone).toBe(true);
    expect(secondDone).toBe(true);
    expect(firstMeta).toEqual({ isNewHighScore: false });
    expect(secondMeta).toBeUndefined();
    expect(readMock).toHaveBeenCalledTimes(1);
    expect(writeMock).toHaveBeenCalledTimes(1);
  });
});
