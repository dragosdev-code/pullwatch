import { describe, it, expect, beforeEach } from 'vitest';
import { createGameStore, __resetSessionRoundIdForTests } from '../game-store';
import { buildCheckpointFromState } from '../build-checkpoint';
import { MODE_CONFIGS } from '../game-config';
import type { MinigameSessionCheckpoint } from '@common/types';

beforeEach(() => {
  __resetSessionRoundIdForTests();
});

function makeCheckpoint(overrides: Partial<MinigameSessionCheckpoint> = {}): MinigameSessionCheckpoint {
  return {
    mode: 'standard',
    score: 150,
    combo: 3,
    highestCombo: 5,
    bugsSquashed: 10,
    featuresBroken: 2,
    elapsedMs: 15_000,
    timeRemainingMs: 15_000,
    gridSize: 4,
    savedAt: Date.now(),
    ...overrides,
  };
}

describe('resumeFromCheckpoint', () => {
  it('restores counters from the checkpoint', () => {
    const store = createGameStore();
    const cp = makeCheckpoint();
    store.getState().resumeFromCheckpoint(cp, 1000);
    const s = store.getState();

    expect(s.status).toBe('playing');
    expect(s.mode).toBe('standard');
    expect(s.score).toBe(150);
    expect(s.combo).toBe(3);
    expect(s.highestCombo).toBe(5);
    expect(s.bugsSquashed).toBe(10);
    expect(s.featuresBroken).toBe(2);
  });

  it('sets timeRemainingMs from the checkpoint', () => {
    const store = createGameStore();
    const cp = makeCheckpoint({ timeRemainingMs: 12_000 });
    store.getState().resumeFromCheckpoint(cp, 5000);
    expect(store.getState().timeRemainingMs).toBe(12_000);
  });

  it('starts with an empty grid at the checkpoint gridSize', () => {
    const store = createGameStore();
    const cp = makeCheckpoint({ gridSize: 5 });
    store.getState().resumeFromCheckpoint(cp, 1000);
    const s = store.getState();
    expect(s.gridSize).toBe(5);
    expect(s.activeTargets).toHaveLength(25);
    expect(s.activeTargets.every((t) => t === null)).toBe(true);
  });

  it('schedules the first spawn after resuming', () => {
    const store = createGameStore();
    const cp = makeCheckpoint({ mode: 'standard' });
    const now = 5000;
    store.getState().resumeFromCheckpoint(cp, now);
    const s = store.getState();
    const config = MODE_CONFIGS.standard;
    expect(s.nextBugSpawnAt).toBe(now + config.spawnIntervalMs);
    expect(s.nextFeatureSpawnAt).toBe(now + config.featureSpawnIntervalMs);
  });

  it('uses a fresh roundId on resume', () => {
    const store = createGameStore();
    store.getState().startGame('standard', 0);
    const firstRoundId = store.getState().roundId;
    store.getState().reset();

    store.getState().resumeFromCheckpoint(makeCheckpoint(), 1000);
    expect(store.getState().roundId).not.toBe(firstRoundId);
  });
});

describe('buildCheckpointFromState', () => {
  it('returns null when the game is idle', () => {
    const store = createGameStore();
    expect(buildCheckpointFromState(store.getState(), Date.now())).toBeNull();
  });

  it('returns null when the game is finished', () => {
    const store = createGameStore();
    store.getState().startGame('standard', 0);
    store.getState().endGame();
    expect(buildCheckpointFromState(store.getState(), Date.now())).toBeNull();
  });

  it('returns a valid checkpoint when the game is playing', () => {
    const store = createGameStore();
    store.getState().startGame('standard', 0);
    // Advance time
    store.setState({ score: 42, combo: 2, highestCombo: 3, bugsSquashed: 5, featuresBroken: 1 });
    const now = Date.now();
    const cp = buildCheckpointFromState(store.getState(), now);

    expect(cp).not.toBeNull();
    expect(cp!.mode).toBe('standard');
    expect(cp!.score).toBe(42);
    expect(cp!.combo).toBe(2);
    expect(cp!.highestCombo).toBe(3);
    expect(cp!.bugsSquashed).toBe(5);
    expect(cp!.featuresBroken).toBe(1);
    expect(cp!.savedAt).toBe(now);
  });
});
