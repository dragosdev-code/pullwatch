import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGameStore, __resetSessionRoundIdForTests } from '../game-store';
import {
  COMBO_SCORE_MULTIPLIER_CAP,
  FEATURE_SPAWN_PROBABILITY,
  HIT_STOP_MS,
  MODE_CONFIGS,
  PHASE_BASE_POINTS,
  POINTS_PER_FEATURE,
  SCREEN_SHAKE_MS,
} from '../game-config';
import type { Target } from '../game-types';

beforeEach(() => {
  __resetSessionRoundIdForTests();
});

function buildStore(
  opts: {
    randomSequence?: number[];
    generateId?: () => string;
  } = {}
) {
  const queue = opts.randomSequence ? opts.randomSequence.slice() : [];
  const random = vi.fn(() => {
    if (queue.length === 0) return 0;
    const next = queue.shift();
    return next ?? 0;
  });
  let counter = 0;
  const generateId =
    opts.generateId ??
    (() => {
      counter += 1;
      return `t_${counter}`;
    });
  const store = createGameStore({ random, generateId });
  return { store, random, generateId };
}

describe('createGameStore initial state', () => {
  it('reports idle status with the standard mode config', () => {
    const { store } = buildStore();
    const s = store.getState();
    expect(s.status).toBe('idle');
    expect(s.mode).toBe('standard');
    expect(s.gridSize).toBe(MODE_CONFIGS.standard.initialGridSize);
    expect(s.activeTargets).toHaveLength(MODE_CONFIGS.standard.initialGridSize ** 2);
    expect(s.score).toBe(0);
    expect(s.combo).toBe(0);
  });
});

describe('startGame', () => {
  it('seeds standard mode with a thirty second timer and a three by three grid', () => {
    const { store } = buildStore();
    store.getState().startGame('standard', 1_000);
    const s = store.getState();
    expect(s.status).toBe('playing');
    expect(s.mode).toBe('standard');
    expect(s.roundId).toBe(1);
    expect(s.gridSize).toBe(3);
    expect(s.activeTargets).toHaveLength(9);
    expect(s.timeRemainingMs).toBe(30_000);
    expect(s.startedAt).toBe(1_000);
    expect(s.nextSpawnAt).toBe(1_000 + MODE_CONFIGS.standard.spawnIntervalMs);
  });

  it('seeds fridayDeploy mode with a fifteen second timer and tripled spawn rate', () => {
    const { store } = buildStore();
    store.getState().startGame('fridayDeploy', 0);
    const s = store.getState();
    expect(s.config.durationMs).toBe(15_000);
    expect(s.config.spawnIntervalMs).toBe(250);
    expect(s.config.targetLifetimeMs).toBe(400);
  });

  it('seeds scopeCreep mode with both grid expansion stages configured', () => {
    const { store } = buildStore();
    store.getState().startGame('scopeCreep', 0);
    const s = store.getState();
    expect(s.gridSize).toBe(3);
    expect(s.config.gridExpansionSchedule).toEqual([
      { triggerAtRemainingMs: 20_000, gridSize: 4 },
      { triggerAtRemainingMs: 10_000, gridSize: 5 },
    ]);
  });

  it('seeds legacy mode with two clicks needed to kill a bug', () => {
    const { store } = buildStore();
    store.getState().startGame('legacy', 0);
    expect(store.getState().config.bugClicksToKill).toBe(2);
  });

  it('clears prior round counters when starting a new round', () => {
    const { store } = buildStore();
    store.setState({ score: 999, combo: 7, highestCombo: 12, bugsSquashed: 5 });
    store.getState().startGame('standard', 0);
    const s = store.getState();
    expect(s.score).toBe(0);
    expect(s.combo).toBe(0);
    expect(s.highestCombo).toBe(0);
    expect(s.bugsSquashed).toBe(0);
  });
});

describe('tick advancing the simulation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('advances elapsedMs and decrements timeRemainingMs based on now', () => {
    const { store } = buildStore();
    store.getState().startGame('standard', 0);
    store.getState().tick(2_000);
    const s = store.getState();
    expect(s.elapsedMs).toBe(2_000);
    expect(s.timeRemainingMs).toBe(28_000);
  });

  it('does nothing when status is not playing', () => {
    const { store } = buildStore();
    const before = store.getState();
    store.getState().tick(500);
    expect(store.getState()).toEqual(before);
  });

  it('skips advancing while inside the hit stop window', () => {
    const { store } = buildStore();
    store.getState().startGame('standard', 0);
    store.setState({ hitStopUntil: 100 });
    store.getState().tick(50);
    expect(store.getState().elapsedMs).toBe(0);
  });

  it('despawns targets whose despawnAt has passed', () => {
    const { store } = buildStore();
    store.getState().startGame('standard', 0);
    const expired: Target = {
      id: 'expired',
      kind: 'bug',
      spawnedAt: 0,
      despawnAt: 500,
      damageStage: 0,
    };
    const fresh: Target = {
      id: 'fresh',
      kind: 'bug',
      spawnedAt: 0,
      despawnAt: 5_000,
      damageStage: 0,
    };
    const next = store.getState().activeTargets.slice();
    next[0] = expired;
    next[1] = fresh;
    store.setState({ activeTargets: next, nextSpawnAt: 60_000 });
    store.getState().tick(1_000);
    const s = store.getState();
    expect(s.activeTargets[0]).toBeNull();
    expect(s.activeTargets[1]?.id).toBe('fresh');
  });

  it('spawns a bug into the first empty cell when random places early', () => {
    const { store } = buildStore({ randomSequence: [0, 0.9] });
    store.getState().startGame('standard', 0);
    const interval = MODE_CONFIGS.standard.spawnIntervalMs;
    store.getState().tick(interval + 10);
    const s = store.getState();
    const spawned = s.activeTargets[0];
    expect(spawned).not.toBeNull();
    expect(spawned?.kind).toBe('bug');
    expect(s.nextSpawnAt).toBe(interval + 10 + interval);
  });

  it('spawns a feature when the random roll is below the feature probability', () => {
    const { store } = buildStore({
      randomSequence: [0, FEATURE_SPAWN_PROBABILITY - 0.01],
    });
    store.getState().startGame('standard', 0);
    store.getState().tick(MODE_CONFIGS.standard.spawnIntervalMs + 1);
    expect(store.getState().activeTargets[0]?.kind).toBe('feature');
  });

  it('does not overwrite an occupied cell when picking the spawn slot', () => {
    const { store } = buildStore({ randomSequence: [0, 0.9] });
    store.getState().startGame('standard', 0);
    const occupied: Target = {
      id: 'occupied',
      kind: 'bug',
      spawnedAt: 0,
      despawnAt: 999_999,
      damageStage: 0,
    };
    const next = store.getState().activeTargets.slice();
    next[0] = occupied;
    store.setState({ activeTargets: next });
    store.getState().tick(MODE_CONFIGS.standard.spawnIntervalMs + 1);
    const s = store.getState();
    expect(s.activeTargets[0]?.id).toBe('occupied');
    const spawnedElsewhere = s.activeTargets.findIndex((t) => t !== null && t.id !== 'occupied');
    expect(spawnedElsewhere).toBeGreaterThan(0);
  });

  it('expands scopeCreep grid to four by four once twenty seconds remain', () => {
    const { store } = buildStore({ randomSequence: Array(20).fill(0.9) });
    store.getState().startGame('scopeCreep', 0);
    store.getState().tick(10_000);
    expect(store.getState().gridSize).toBe(4);
    expect(store.getState().activeTargets.length).toBe(16);
  });

  it('expands scopeCreep grid to five by five once ten seconds remain', () => {
    const { store } = buildStore({ randomSequence: Array(40).fill(0.9) });
    store.getState().startGame('scopeCreep', 0);
    store.getState().tick(20_000);
    expect(store.getState().gridSize).toBe(5);
    expect(store.getState().activeTargets.length).toBe(25);
  });

  it('finishes the game when the timer reaches zero', () => {
    const { store } = buildStore();
    store.getState().startGame('standard', 0);
    store.getState().tick(30_000);
    const s = store.getState();
    expect(s.status).toBe('finished');
    expect(s.timeRemainingMs).toBe(0);
    expect(s.activeTargets.every((t) => t === null)).toBe(true);
  });
});

describe('endGame', () => {
  it('sets time remaining to zero and matches elapsed to the implied clock from the timer', () => {
    const { store } = buildStore();
    store.getState().startGame('standard', 0);
    store.setState({ timeRemainingMs: 20_000, elapsedMs: 10_000 });
    store.getState().endGame();
    const s = store.getState();
    expect(s.status).toBe('finished');
    expect(s.timeRemainingMs).toBe(0);
    expect(s.elapsedMs).toBe(10_000);
    expect(s.lastClick).toBeNull();
  });

  it('is a no op when not playing', () => {
    const { store } = buildStore();
    store.getState().endGame();
    expect(store.getState().status).toBe('idle');
  });
});

describe('clickCell scoring and combo behavior', () => {
  it('returns noop when the game is not playing', () => {
    const { store } = buildStore();
    expect(store.getState().clickCell(0, 0)).toEqual({ kind: 'noop' });
  });

  it('returns noop for out of range cell indices', () => {
    const { store } = buildStore();
    store.getState().startGame('standard', 0);
    expect(store.getState().clickCell(-1, 0)).toEqual({ kind: 'noop' });
    expect(store.getState().clickCell(9, 0)).toEqual({ kind: 'noop' });
  });

  it('squashes a bug for plus ten points and increments the combo', () => {
    const { store } = buildStore();
    store.getState().startGame('standard', 0);
    const bug: Target = {
      id: 'b1',
      kind: 'bug',
      spawnedAt: 0,
      despawnAt: 5_000,
      damageStage: 0,
    };
    const next = store.getState().activeTargets.slice();
    next[0] = bug;
    store.setState({ activeTargets: next });

    const outcome = store.getState().clickCell(0, 100);
    expect(outcome).toEqual({
      kind: 'bug_squashed',
      basePoints: PHASE_BASE_POINTS.fresh,
      multiplier: 1,
      points: PHASE_BASE_POINTS.fresh,
      combo: 1,
      phase: 'fresh',
    });
    const s = store.getState();
    expect(s.score).toBe(PHASE_BASE_POINTS.fresh);
    expect(s.combo).toBe(1);
    expect(s.highestCombo).toBe(1);
    expect(s.bugsSquashed).toBe(1);
    expect(s.activeTargets[0]).toBeNull();
    expect(s.hitStopUntil).toBe(100 + HIT_STOP_MS);
    expect(s.lastClick?.outcome.kind).toBe('bug_squashed');
  });

  it('multiplies points by capped combo on consecutive squashes', () => {
    const { store } = buildStore();
    store.getState().startGame('standard', 0);
    const bug = (id: string): Target => ({
      id,
      kind: 'bug',
      spawnedAt: 0,
      despawnAt: 5_000,
      damageStage: 0,
    });
    const next = store.getState().activeTargets.slice();
    next[0] = bug('a');
    next[1] = bug('b');
    next[2] = bug('c');
    store.setState({ activeTargets: next });

    store.getState().clickCell(0, 100);
    store.getState().clickCell(1, 150);
    store.getState().clickCell(2, 200);
    const s = store.getState();
    expect(s.combo).toBe(3);
    expect(s.highestCombo).toBe(3);
    // Each clicked at <1/3 of standard lifetime (1100ms) → fresh tier (10 base) every time.
    // Score = 10*1 + 10*2 + 10*3 = 60.
    expect(s.score).toBe(PHASE_BASE_POINTS.fresh * (1 + 2 + 3));
  });

  it('caps the combo multiplier on the per-hit score', () => {
    const { store } = buildStore();
    store.getState().startGame('standard', 0);
    const bug: Target = {
      id: 'capped',
      kind: 'bug',
      spawnedAt: 0,
      despawnAt: 5_000,
      damageStage: 0,
    };
    const next = store.getState().activeTargets.slice();
    next[0] = bug;
    store.setState({
      activeTargets: next,
      // Pre-load combo so the next squash would exceed the cap.
      combo: COMBO_SCORE_MULTIPLIER_CAP + 4,
      highestCombo: COMBO_SCORE_MULTIPLIER_CAP + 4,
    });

    const outcome = store.getState().clickCell(0, 50);
    expect(outcome.kind).toBe('bug_squashed');
    if (outcome.kind !== 'bug_squashed') return;
    expect(outcome.combo).toBe(COMBO_SCORE_MULTIPLIER_CAP + 5);
    expect(outcome.multiplier).toBe(COMBO_SCORE_MULTIPLIER_CAP);
    expect(outcome.points).toBe(PHASE_BASE_POINTS.fresh * COMBO_SCORE_MULTIPLIER_CAP);
    expect(store.getState().score).toBe(PHASE_BASE_POINTS.fresh * COMBO_SCORE_MULTIPLIER_CAP);
  });

  it('awards middle-tier base points when the bug is in its middle phase', () => {
    const { store } = buildStore();
    store.getState().startGame('standard', 0);
    const lifetime = MODE_CONFIGS.standard.targetLifetimeMs;
    const bug: Target = {
      id: 'mid',
      kind: 'bug',
      spawnedAt: 0,
      despawnAt: lifetime,
      damageStage: 0,
    };
    const next = store.getState().activeTargets.slice();
    next[0] = bug;
    store.setState({ activeTargets: next });

    // Clock at ~50% of lifetime → middle phase.
    const outcome = store.getState().clickCell(0, Math.floor(lifetime / 2));
    expect(outcome.kind).toBe('bug_squashed');
    if (outcome.kind !== 'bug_squashed') return;
    expect(outcome.phase).toBe('middle');
    expect(outcome.basePoints).toBe(PHASE_BASE_POINTS.middle);
    expect(outcome.points).toBe(PHASE_BASE_POINTS.middle);
    expect(store.getState().score).toBe(PHASE_BASE_POINTS.middle);
  });

  it('awards final-tier base points when the bug is in its final phase', () => {
    const { store } = buildStore();
    store.getState().startGame('standard', 0);
    const lifetime = MODE_CONFIGS.standard.targetLifetimeMs;
    const bug: Target = {
      id: 'late',
      kind: 'bug',
      spawnedAt: 0,
      despawnAt: lifetime,
      damageStage: 0,
    };
    const next = store.getState().activeTargets.slice();
    next[0] = bug;
    store.setState({ activeTargets: next });

    // Clock past the 2/3 lifetime threshold but before despawn → final phase.
    const outcome = store.getState().clickCell(0, Math.floor((lifetime * 5) / 6));
    expect(outcome.kind).toBe('bug_squashed');
    if (outcome.kind !== 'bug_squashed') return;
    expect(outcome.phase).toBe('final');
    expect(outcome.basePoints).toBe(PHASE_BASE_POINTS.final);
    expect(outcome.points).toBe(PHASE_BASE_POINTS.final);
    expect(store.getState().score).toBe(PHASE_BASE_POINTS.final);
  });

  it('breaks a feature for minus twenty points and resets the combo to zero', () => {
    const { store } = buildStore();
    store.getState().startGame('standard', 0);
    store.setState({ combo: 5, highestCombo: 5 });
    const feature: Target = {
      id: 'f1',
      kind: 'feature',
      spawnedAt: 0,
      despawnAt: 5_000,
      damageStage: 0,
    };
    const next = store.getState().activeTargets.slice();
    next[3] = feature;
    store.setState({ activeTargets: next });

    const outcome = store.getState().clickCell(3, 100);
    expect(outcome).toEqual({ kind: 'feature_broken', points: POINTS_PER_FEATURE });
    const s = store.getState();
    expect(s.score).toBe(POINTS_PER_FEATURE);
    expect(s.combo).toBe(0);
    expect(s.highestCombo).toBe(5);
    expect(s.featuresBroken).toBe(1);
    expect(s.activeTargets[3]).toBeNull();
    expect(s.shakeUntil).toBe(100 + SCREEN_SHAKE_MS);
  });

  it('treats an empty cell click as a miss that resets combo and shakes the grid', () => {
    const { store } = buildStore();
    store.getState().startGame('standard', 0);
    store.setState({ combo: 4 });

    const outcome = store.getState().clickCell(7, 200);
    expect(outcome).toEqual({ kind: 'miss' });
    const s = store.getState();
    expect(s.combo).toBe(0);
    expect(s.score).toBe(0);
    expect(s.shakeUntil).toBe(200 + SCREEN_SHAKE_MS);
  });

  it('cracks a legacy bug on the first click without scoring or breaking combo', () => {
    const { store } = buildStore();
    store.getState().startGame('legacy', 0);
    const bug: Target = {
      id: 'lb',
      kind: 'bug',
      spawnedAt: 0,
      despawnAt: 5_000,
      damageStage: 0,
    };
    const next = store.getState().activeTargets.slice();
    next[4] = bug;
    store.setState({ activeTargets: next, combo: 2 });

    const outcome = store.getState().clickCell(4, 100);
    expect(outcome).toEqual({ kind: 'bug_cracked', combo: 2, phase: 'fresh' });
    const s = store.getState();
    expect(s.score).toBe(0);
    expect(s.combo).toBe(2);
    expect(s.activeTargets[4]?.damageStage).toBe(1);
    expect(s.bugsSquashed).toBe(0);
    expect(s.hitStopUntil).toBe(100 + HIT_STOP_MS);
  });

  it('squashes a legacy bug on the second click after it was cracked', () => {
    const { store } = buildStore();
    store.getState().startGame('legacy', 0);
    const bug: Target = {
      id: 'lb',
      kind: 'bug',
      spawnedAt: 0,
      despawnAt: 5_000,
      damageStage: 1,
    };
    const next = store.getState().activeTargets.slice();
    next[4] = bug;
    store.setState({ activeTargets: next });

    const outcome = store.getState().clickCell(4, 200);
    expect(outcome).toEqual({
      kind: 'bug_squashed',
      basePoints: PHASE_BASE_POINTS.fresh,
      multiplier: 1,
      points: PHASE_BASE_POINTS.fresh,
      combo: 1,
      phase: 'fresh',
    });
    expect(store.getState().score).toBe(PHASE_BASE_POINTS.fresh);
    expect(store.getState().activeTargets[4]).toBeNull();
  });
});
