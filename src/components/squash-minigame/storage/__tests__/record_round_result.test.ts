import { describe, it, expect } from 'vitest';
import { applyRoundResultToStats } from '../record-round-result';
import { ensureCompleteMinigameStats } from '../minigame-stats-defaults';

describe('applyRoundResultToStats', () => {
  it('records the first play for a mode and bumps overall counters', () => {
    const start = ensureCompleteMinigameStats(undefined);
    const next = applyRoundResultToStats(start, {
      mode: 'standard',
      score: 50,
      highestCombo: 4,
      bugsSquashed: 6,
      featuresBroken: 1,
      durationSeconds: 30,
    });
    expect(next.modes.standard.playCount).toBe(1);
    expect(next.modes.standard.highScore).toBe(50);
    expect(next.modes.standard.highestCombo).toBe(4);
    expect(next.overall.totalBugsSquashed).toBe(6);
    expect(next.overall.totalFeaturesBroken).toBe(1);
    expect(next.overall.totalTimePlayedSeconds).toBe(30);
    expect(next.lastPlayedMode).toBe('standard');
  });

  it('keeps the higher of the previous and current high score', () => {
    const start = ensureCompleteMinigameStats({
      modes: {
        standard: { playCount: 3, highScore: 120, highestCombo: 7 },
      },
    } as never);
    const next = applyRoundResultToStats(start, {
      mode: 'standard',
      score: 80,
      highestCombo: 9,
      bugsSquashed: 0,
      featuresBroken: 0,
      durationSeconds: 30,
    });
    expect(next.modes.standard.highScore).toBe(120);
    expect(next.modes.standard.highestCombo).toBe(9);
    expect(next.modes.standard.playCount).toBe(4);
  });

  it('only mutates the matching mode bucket', () => {
    const start = ensureCompleteMinigameStats(undefined);
    const next = applyRoundResultToStats(start, {
      mode: 'fridayDeploy',
      score: 200,
      highestCombo: 12,
      bugsSquashed: 18,
      featuresBroken: 2,
      durationSeconds: 15,
    });
    expect(next.modes.standard.playCount).toBe(0);
    expect(next.modes.legacy.playCount).toBe(0);
    expect(next.modes.scopeCreep.playCount).toBe(0);
    expect(next.modes.fridayDeploy.playCount).toBe(1);
  });

  it('floors negative durations to zero before adding to total time', () => {
    const start = ensureCompleteMinigameStats(undefined);
    const next = applyRoundResultToStats(start, {
      mode: 'standard',
      score: 0,
      highestCombo: 0,
      bugsSquashed: 0,
      featuresBroken: 0,
      durationSeconds: -5,
    });
    expect(next.overall.totalTimePlayedSeconds).toBe(0);
  });
});
