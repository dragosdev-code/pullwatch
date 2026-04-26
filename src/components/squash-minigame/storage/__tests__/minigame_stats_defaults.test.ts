import { describe, it, expect } from 'vitest';
import type { GameMode } from '../../game-types';
import { DEFAULT_MINIGAME_STATS, ensureCompleteMinigameStats } from '../minigame-stats-defaults';

const ALL_MODES: GameMode[] = ['standard', 'legacy', 'scopeCreep', 'fridayDeploy'];

describe('ensureCompleteMinigameStats', () => {
  it('returns a fully populated default object when given undefined', () => {
    const result = ensureCompleteMinigameStats(undefined);
    expect(result.hasDiscovered).toBe(false);
    expect(result.hasSeenSquashQuickStart).toBe(false);
    expect(result.popupOpenCount).toBe(0);
    expect(result.lastPlayedMode).toBeUndefined();
    expect(result.overall).toEqual({
      totalBugsSquashed: 0,
      totalFeaturesBroken: 0,
      totalTimePlayedSeconds: 0,
    });
    for (const mode of ALL_MODES) {
      expect(result.modes[mode]).toEqual({ playCount: 0, highScore: 0, highestCombo: 0 });
    }
  });

  it('does not crash on null and returns defaults', () => {
    const result = ensureCompleteMinigameStats(null);
    expect(result).toEqual(ensureCompleteMinigameStats(undefined));
  });

  it('merges a partial overall counter onto defaults without losing modes or zero counters', () => {
    const result = ensureCompleteMinigameStats({
      overall: {
        totalBugsSquashed: 5,
        totalFeaturesBroken: 0,
        totalTimePlayedSeconds: 0,
      },
    });
    expect(result.overall.totalBugsSquashed).toBe(5);
    expect(result.overall.totalFeaturesBroken).toBe(0);
    expect(result.popupOpenCount).toBe(0);
    expect(result.hasDiscovered).toBe(false);
    expect(result.hasSeenSquashQuickStart).toBe(false);
    for (const mode of ALL_MODES) {
      expect(result.modes[mode]).toEqual({ playCount: 0, highScore: 0, highestCombo: 0 });
    }
  });

  it('preserves a stored partial mode entry and fills in the others', () => {
    const result = ensureCompleteMinigameStats({
      modes: {
        legacy: { playCount: 3, highScore: 120, highestCombo: 7 },
      } as never,
    });
    expect(result.modes.legacy).toEqual({ playCount: 3, highScore: 120, highestCombo: 7 });
    expect(result.modes.standard).toEqual({ playCount: 0, highScore: 0, highestCombo: 0 });
    expect(result.modes.scopeCreep).toEqual({ playCount: 0, highScore: 0, highestCombo: 0 });
    expect(result.modes.fridayDeploy).toEqual({ playCount: 0, highScore: 0, highestCombo: 0 });
  });

  it('returns an object the caller can safely mutate without poisoning the default constant', () => {
    const a = ensureCompleteMinigameStats(undefined);
    a.popupOpenCount = 999;
    a.overall.totalBugsSquashed = 42;
    a.modes.standard.highScore = 9001;

    const b = ensureCompleteMinigameStats(undefined);
    expect(b.popupOpenCount).toBe(0);
    expect(b.overall.totalBugsSquashed).toBe(0);
    expect(b.modes.standard.highScore).toBe(0);

    expect(DEFAULT_MINIGAME_STATS.popupOpenCount).toBe(0);
    expect(DEFAULT_MINIGAME_STATS.overall.totalBugsSquashed).toBe(0);
    expect(DEFAULT_MINIGAME_STATS.modes.standard.highScore).toBe(0);
  });

  it('round trips a complete value', () => {
    const input = {
      hasDiscovered: true,
      hasSeenSquashQuickStart: true,
      popupOpenCount: 42,
      lastPlayedMode: 'fridayDeploy' as GameMode,
      overall: { totalBugsSquashed: 10, totalFeaturesBroken: 2, totalTimePlayedSeconds: 90 },
      modes: {
        standard: { playCount: 1, highScore: 100, highestCombo: 5 },
        legacy: { playCount: 0, highScore: 0, highestCombo: 0 },
        scopeCreep: { playCount: 2, highScore: 200, highestCombo: 9 },
        fridayDeploy: { playCount: 4, highScore: 400, highestCombo: 12 },
      },
    };
    expect(ensureCompleteMinigameStats(input)).toEqual(input);
  });
});
