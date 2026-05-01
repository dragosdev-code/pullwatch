import { describe, it, expect } from 'vitest';
import { applyRoundResultToStats, isNewHighScoreForRound } from '../record-round-result';
import { ensureCompleteMinigameStats } from '../minigame-stats-defaults';

const baseRound = {
  roundId: 1,
  mode: 'standard' as const,
  highestCombo: 0,
  bugsSquashed: 0,
  featuresBroken: 0,
  durationSeconds: 0,
};

describe('isNewHighScoreForRound', () => {
  it('is true on first play with a positive score', () => {
    const stats = ensureCompleteMinigameStats(undefined);
    expect(isNewHighScoreForRound(stats, { ...baseRound, score: 10 })).toBe(true);
  });

  it('is false when score is zero and stored high is zero', () => {
    const stats = ensureCompleteMinigameStats(undefined);
    expect(isNewHighScoreForRound(stats, { ...baseRound, score: 0 })).toBe(false);
  });

  it('is true when score beats the stored high', () => {
    const stats = ensureCompleteMinigameStats({
      modes: { standard: { playCount: 1, highScore: 100, highestCombo: 0 } },
    } as never);
    expect(isNewHighScoreForRound(stats, { ...baseRound, score: 150 })).toBe(true);
  });

  it('is false on a tie with stored high', () => {
    const stats = ensureCompleteMinigameStats({
      modes: { standard: { playCount: 1, highScore: 100, highestCombo: 0 } },
    } as never);
    expect(isNewHighScoreForRound(stats, { ...baseRound, score: 100 })).toBe(false);
  });

  it('is false when score is below stored high', () => {
    const stats = ensureCompleteMinigameStats({
      modes: { standard: { playCount: 2, highScore: 200, highestCombo: 0 } },
    } as never);
    expect(isNewHighScoreForRound(stats, { ...baseRound, score: 50 })).toBe(false);
  });
});

describe('applyRoundResultToStats', () => {
  it('records the first play for a mode and bumps overall counters', () => {
    const start = ensureCompleteMinigameStats(undefined);
    const next = applyRoundResultToStats(start, {
      roundId: 1,
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
      roundId: 1,
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
      roundId: 1,
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
      roundId: 1,
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
