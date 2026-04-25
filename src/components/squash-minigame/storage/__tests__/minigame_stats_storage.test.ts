import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STORAGE_KEY_MINIGAME_STATS } from '@common/constants';

const getMock = vi.fn();
const setMock = vi.fn();

vi.mock('@common/chrome-extension-service', () => ({
  chromeExtensionService: {
    storage: {
      local: {
        get: (...args: unknown[]) => getMock(...args),
        set: (...args: unknown[]) => setMock(...args),
      },
    },
  },
}));

import { readMinigameStats, writeMinigameStats } from '../minigame-stats-storage';
import { ensureCompleteMinigameStats } from '../minigame-stats-defaults';
import type { MinigameStats } from '@common/types';

describe('readMinigameStats', () => {
  beforeEach(() => {
    getMock.mockReset();
    setMock.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns full defaults when the storage key is missing', async () => {
    getMock.mockResolvedValueOnce({});
    const result = await readMinigameStats();
    expect(result).toEqual(ensureCompleteMinigameStats(undefined));
  });

  it('reads with the canonical storage key', async () => {
    getMock.mockResolvedValueOnce({});
    await readMinigameStats();
    expect(getMock).toHaveBeenCalledWith([STORAGE_KEY_MINIGAME_STATS]);
  });

  it('merges a partially populated stored value onto defaults', async () => {
    getMock.mockResolvedValueOnce({
      [STORAGE_KEY_MINIGAME_STATS]: {
        hasDiscovered: true,
        popupOpenCount: 7,
      },
    });
    const result = await readMinigameStats();
    expect(result.hasDiscovered).toBe(true);
    expect(result.popupOpenCount).toBe(7);
    expect(result.modes.standard).toEqual({ playCount: 0, highScore: 0, highestCombo: 0 });
  });

  it('returns defaults when chrome rejects the get call', async () => {
    getMock.mockRejectedValueOnce(new Error('boom'));
    const result = await readMinigameStats();
    expect(result).toEqual(ensureCompleteMinigameStats(undefined));
  });
});

describe('writeMinigameStats', () => {
  beforeEach(() => {
    getMock.mockReset();
    setMock.mockReset().mockResolvedValue(undefined);
  });

  it('writes the full blob under the canonical storage key', async () => {
    const stats: MinigameStats = {
      ...ensureCompleteMinigameStats(undefined),
      popupOpenCount: 3,
      hasDiscovered: false,
    };
    await writeMinigameStats(stats);
    expect(setMock).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith({ [STORAGE_KEY_MINIGAME_STATS]: stats });
  });

  it('propagates a write rejection so callers can decide how to handle it', async () => {
    setMock.mockRejectedValueOnce(new Error('quota exceeded'));
    await expect(writeMinigameStats(ensureCompleteMinigameStats(undefined))).rejects.toThrow(
      'quota exceeded'
    );
  });
});
