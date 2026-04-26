import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGameStore, __resetSessionRoundIdForTests } from '../game-store';
import { DESPAWN_GRACE_MS, PHASE_BASE_POINTS } from '../game-config';
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

describe('tick ordering: expansion-spawn gate', () => {
  it('does not spawn on the same tick the grid grows', () => {
    const { store } = buildStore({ randomSequence: [0] });
    store.getState().startGame('scopeCreep', 0);
    // Set bug spawn timer to fire at the expansion tick.
    store.setState({ nextBugSpawnAt: 10_000, nextFeatureSpawnAt: 999_999 });

    // At 10_000ms elapsed, timeRemaining = 20_000ms → grid expands to 4.
    store.getState().tick(10_000);
    const s = store.getState();
    expect(s.gridSize).toBe(4);
    expect(s.activeTargets).toHaveLength(16);
    // No spawn should have occurred despite bug timer being ready.
    const occupied = s.activeTargets.filter((t) => t !== null);
    expect(occupied).toHaveLength(0);
  });

  it('spawns normally on the tick after a grid expansion', () => {
    const { store } = buildStore({ randomSequence: [0, 0] });
    store.getState().startGame('scopeCreep', 0);
    store.setState({ nextBugSpawnAt: 10_000, nextFeatureSpawnAt: 999_999 });

    // Expansion tick — no spawn.
    store.getState().tick(10_000);
    expect(store.getState().gridSize).toBe(4);

    // Next tick — bug timer was not consumed, so it fires now.
    store.getState().tick(10_001);
    const spawned = store.getState().activeTargets.filter((t) => t !== null);
    expect(spawned).toHaveLength(1);
    expect(spawned[0]?.kind).toBe('bug');
  });
});

describe('tick ordering: despawn happens after spawn', () => {
  it('a target expiring this tick does not free its cell for a spawn in the same tick', () => {
    const { store } = buildStore({ randomSequence: [0] });
    store.getState().startGame('standard', 0);
    // Place a bug that despawns at exactly tick 1000.
    const dyingBug: Target = {
      id: 'dying',
      kind: 'bug',
      spawnedAt: 0,
      despawnAt: 1000,
      damageStage: 0,
    };
    // Fill all cells except one to force the spawner to pick a specific slot.
    const targets = store.getState().activeTargets.slice();
    targets[0] = dyingBug;
    // Leave cells 1-8 null — spawner picks cell 1 (random=0 picks first empty).
    store.setState({
      activeTargets: targets,
      nextBugSpawnAt: 1000,
      nextFeatureSpawnAt: 999_999,
    });

    store.getState().tick(1000);
    const s = store.getState();
    // Cell 0 should be cleared (despawned after spawn).
    expect(s.activeTargets[0]).toBeNull();
    // The new bug should have gone into cell 1 (first empty during spawn phase,
    // because cell 0 was still occupied at spawn time).
    expect(s.activeTargets[1]).not.toBeNull();
    expect(s.activeTargets[1]?.kind).toBe('bug');
  });
});

describe('despawn grace window (recentlyDespawned)', () => {
  it('honours a click on a cell whose target just despawned within DESPAWN_GRACE_MS', () => {
    const { store } = buildStore();
    store.getState().startGame('standard', 0);
    const bug: Target = {
      id: 'grace',
      kind: 'bug',
      spawnedAt: 0,
      despawnAt: 500,
      damageStage: 0,
    };
    const targets = store.getState().activeTargets.slice();
    targets[3] = bug;
    store.setState({
      activeTargets: targets,
      nextBugSpawnAt: 999_999,
      nextFeatureSpawnAt: 999_999,
    });

    // Tick at 500 despawns the bug.
    store.getState().tick(500);
    expect(store.getState().activeTargets[3]).toBeNull();

    // Click within grace window → should register as bug_squashed, not miss.
    const outcome = store.getState().clickCell(3, 500 + DESPAWN_GRACE_MS - 1);
    expect(outcome.kind).toBe('bug_squashed');
    if (outcome.kind === 'bug_squashed') {
      // Bug spawned at 0, click at 549ms, lifetime 1100ms → frac ≈ 0.499 → middle phase.
      expect(outcome.basePoints).toBe(PHASE_BASE_POINTS.middle);
    }
  });

  it('treats a click as a miss when the grace window has expired', () => {
    const { store } = buildStore();
    store.getState().startGame('standard', 0);
    const bug: Target = {
      id: 'stale',
      kind: 'bug',
      spawnedAt: 0,
      despawnAt: 500,
      damageStage: 0,
    };
    const targets = store.getState().activeTargets.slice();
    targets[3] = bug;
    store.setState({
      activeTargets: targets,
      nextBugSpawnAt: 999_999,
      nextFeatureSpawnAt: 999_999,
    });

    store.getState().tick(500);

    // Click after grace window → miss.
    const outcome = store.getState().clickCell(3, 500 + DESPAWN_GRACE_MS + 1);
    expect(outcome.kind).toBe('miss');
  });

  it('evicts stale grace entries on subsequent ticks', () => {
    const { store } = buildStore();
    store.getState().startGame('standard', 0);
    const bug: Target = {
      id: 'evict',
      kind: 'bug',
      spawnedAt: 0,
      despawnAt: 500,
      damageStage: 0,
    };
    const targets = store.getState().activeTargets.slice();
    targets[0] = bug;
    store.setState({
      activeTargets: targets,
      nextBugSpawnAt: 999_999,
      nextFeatureSpawnAt: 999_999,
    });

    // Tick despawns the bug at 500.
    store.getState().tick(500);

    // Another tick well past the grace window evicts the entry.
    store.getState().tick(500 + DESPAWN_GRACE_MS + 100);

    // Click now — should be a clean miss (entry was evicted).
    const outcome = store.getState().clickCell(0, 500 + DESPAWN_GRACE_MS + 100);
    expect(outcome.kind).toBe('miss');
  });

  it('grace click on a feature still counts as feature_broken', () => {
    const { store } = buildStore();
    store.getState().startGame('standard', 0);
    const feature: Target = {
      id: 'grace-feat',
      kind: 'feature',
      spawnedAt: 0,
      despawnAt: 500,
      damageStage: 0,
    };
    const targets = store.getState().activeTargets.slice();
    targets[2] = feature;
    store.setState({
      activeTargets: targets,
      nextBugSpawnAt: 999_999,
      nextFeatureSpawnAt: 999_999,
    });

    store.getState().tick(500);
    const outcome = store.getState().clickCell(2, 500 + 10);
    expect(outcome.kind).toBe('feature_broken');
  });

  it('grace window is cleared on startGame', () => {
    const { store } = buildStore();
    store.getState().startGame('standard', 0);
    const bug: Target = {
      id: 'cleared',
      kind: 'bug',
      spawnedAt: 0,
      despawnAt: 500,
      damageStage: 0,
    };
    const targets = store.getState().activeTargets.slice();
    targets[0] = bug;
    store.setState({
      activeTargets: targets,
      nextBugSpawnAt: 999_999,
      nextFeatureSpawnAt: 999_999,
    });

    store.getState().tick(500);

    // Start a new game — grace entries from the old round must not leak.
    store.getState().startGame('standard', 1000);
    const outcome = store.getState().clickCell(0, 1000 + 10);
    expect(outcome.kind).toBe('miss');
  });
});
