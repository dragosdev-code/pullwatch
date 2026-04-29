import { describe, it, expect, vi } from 'vitest';
import {
  pickEmptyIndices,
  pickOne,
  computeExpansionResult,
  resizeTargetBuffer,
  runSpawnForTick,
  applyDespawnsForTick,
  evictExpiredGraceEntries,
} from '../game-tick';
import { DESPAWN_GRACE_MS, MODE_CONFIGS, type ModeConfig } from '../game-config';
import type { Target } from '../game-types';

function bug(overrides: Partial<Target> = {}): Target {
  return {
    id: 'b',
    kind: 'bug',
    spawnedAt: 0,
    despawnAt: 1000,
    damageStage: 0,
    ...overrides,
  };
}

function feature(overrides: Partial<Target> = {}): Target {
  return {
    id: 'f',
    kind: 'feature',
    spawnedAt: 0,
    despawnAt: 1000,
    damageStage: 0,
    ...overrides,
  };
}

describe('pickEmptyIndices', () => {
  it('returns all indices for an all-null grid', () => {
    expect(pickEmptyIndices([null, null, null])).toEqual([0, 1, 2]);
  });

  it('returns [] for a fully occupied grid', () => {
    expect(pickEmptyIndices([bug(), bug(), feature()])).toEqual([]);
  });

  it('returns only the indices of null slots', () => {
    expect(pickEmptyIndices([bug(), null, feature(), null])).toEqual([1, 3]);
  });
});

describe('pickOne', () => {
  it('selects the first index when random=0', () => {
    expect(pickOne([5, 9, 12], () => 0)).toBe(5);
  });

  it('selects the last index when random approaches 1', () => {
    expect(pickOne([5, 9, 12], () => 0.999_999)).toBe(12);
  });

  it('clamps to last index when random rounds past length', () => {
    expect(pickOne([5, 9, 12], () => 1)).toBe(12);
  });
});

describe('computeExpansionResult', () => {
  it('returns prev gridSize and grew=false when schedule is empty', () => {
    const config = MODE_CONFIGS.standard;
    expect(computeExpansionResult(3, config, 25_000)).toEqual({ gridSize: 3, grew: false });
  });

  it('does not expand before the first trigger', () => {
    const config = MODE_CONFIGS.scopeCreep;
    expect(computeExpansionResult(3, config, 25_000)).toEqual({ gridSize: 3, grew: false });
  });

  it('expands once timeRemaining crosses the first trigger', () => {
    const config = MODE_CONFIGS.scopeCreep;
    expect(computeExpansionResult(3, config, 20_000)).toEqual({ gridSize: 4, grew: true });
  });

  it('picks the largest applicable stage when multiple triggers have fired', () => {
    const config = MODE_CONFIGS.scopeCreep;
    expect(computeExpansionResult(3, config, 5_000)).toEqual({ gridSize: 5, grew: true });
  });

  it('returns grew=false when prevGridSize already matches the schedule', () => {
    const config = MODE_CONFIGS.scopeCreep;
    expect(computeExpansionResult(4, config, 20_000)).toEqual({ gridSize: 4, grew: false });
  });
});

describe('resizeTargetBuffer', () => {
  it('returns the same reference when the buffer already matches gridSize²', () => {
    const buf: (Target | null)[] = new Array(9).fill(null);
    expect(resizeTargetBuffer(buf, 3)).toBe(buf);
  });

  it('returns the same reference when gridSize would shrink the buffer', () => {
    const buf: (Target | null)[] = new Array(16).fill(null);
    expect(resizeTargetBuffer(buf, 3)).toBe(buf);
  });

  it('returns a new padded array when growing', () => {
    const buf: (Target | null)[] = [bug(), null, null, null, null, null, null, null, null];
    const out = resizeTargetBuffer(buf, 4);
    expect(out).not.toBe(buf);
    expect(out).toHaveLength(16);
    expect(out[0]).toEqual(buf[0]);
    for (let i = 9; i < 16; i += 1) expect(out[i]).toBeNull();
  });
});

describe('runSpawnForTick', () => {
  const baseConfig: ModeConfig = MODE_CONFIGS.standard;

  it('skips spawn entirely when grew=true even if both timers are ready', () => {
    const activeTargets: (Target | null)[] = new Array(9).fill(null);
    const out = runSpawnForTick({
      grew: true,
      now: 10_000,
      config: baseConfig,
      activeTargets,
      nextBugSpawnAt: 0,
      nextFeatureSpawnAt: 0,
      random: () => 0,
      generateId: () => 'x',
    });
    expect(out.activeTargets).toBe(activeTargets);
    expect(out.nextBugSpawnAt).toBe(0);
    expect(out.nextFeatureSpawnAt).toBe(0);
  });

  it('does not spawn when neither timer has fired', () => {
    const activeTargets: (Target | null)[] = new Array(9).fill(null);
    const out = runSpawnForTick({
      grew: false,
      now: 100,
      config: baseConfig,
      activeTargets,
      nextBugSpawnAt: 1_000,
      nextFeatureSpawnAt: 1_000,
      random: () => 0,
      generateId: () => 'x',
    });
    expect(out.activeTargets).toBe(activeTargets);
    expect(out.nextBugSpawnAt).toBe(1_000);
    expect(out.nextFeatureSpawnAt).toBe(1_000);
  });

  it('spawns a bug and advances the bug timer when the bug gate fires', () => {
    const activeTargets: (Target | null)[] = new Array(9).fill(null);
    const out = runSpawnForTick({
      grew: false,
      now: 1_000,
      config: baseConfig,
      activeTargets,
      nextBugSpawnAt: 1_000,
      nextFeatureSpawnAt: 999_999,
      random: () => 0,
      generateId: () => 'bug-1',
    });
    expect(out.activeTargets).not.toBe(activeTargets);
    expect(out.activeTargets[0]?.kind).toBe('bug');
    expect(out.activeTargets[0]?.id).toBe('bug-1');
    expect(out.activeTargets[0]?.spawnedAt).toBe(1_000);
    expect(out.activeTargets[0]?.despawnAt).toBe(1_000 + baseConfig.targetLifetimeMs);
    expect(out.nextBugSpawnAt).toBe(1_000 + baseConfig.spawnIntervalMs);
    expect(out.nextFeatureSpawnAt).toBe(999_999);
  });

  it('spawns a feature and advances the feature timer when only the feature gate fires', () => {
    const activeTargets: (Target | null)[] = new Array(9).fill(null);
    const out = runSpawnForTick({
      grew: false,
      now: 1_000,
      config: baseConfig,
      activeTargets,
      nextBugSpawnAt: 999_999,
      nextFeatureSpawnAt: 1_000,
      random: () => 0,
      generateId: () => 'feat-1',
    });
    expect(out.activeTargets[0]?.kind).toBe('feature');
    expect(out.nextBugSpawnAt).toBe(999_999);
    expect(out.nextFeatureSpawnAt).toBe(1_000 + baseConfig.featureSpawnIntervalMs);
  });

  it('spawns bug then feature in distinct cells when both gates fire on the same tick', () => {
    const activeTargets: (Target | null)[] = new Array(9).fill(null);
    let calls = 0;
    const ids = ['bug-1', 'feat-1'];
    const out = runSpawnForTick({
      grew: false,
      now: 1_000,
      config: baseConfig,
      activeTargets,
      nextBugSpawnAt: 1_000,
      nextFeatureSpawnAt: 1_000,
      random: () => 0,
      generateId: () => ids[calls++] ?? 'extra',
    });
    expect(out.activeTargets[0]?.id).toBe('bug-1');
    expect(out.activeTargets[1]?.id).toBe('feat-1');
    expect(out.activeTargets[1]?.kind).toBe('feature');
    expect(calls).toBe(2);
  });

  it('consumes the bug timer even when there are no empty cells', () => {
    const activeTargets: (Target | null)[] = new Array(9).fill(null).map(() => bug());
    const generateId = vi.fn(() => 'should-not-be-called');
    const out = runSpawnForTick({
      grew: false,
      now: 1_000,
      config: baseConfig,
      activeTargets,
      nextBugSpawnAt: 1_000,
      nextFeatureSpawnAt: 999_999,
      random: () => 0,
      generateId,
    });
    expect(out.activeTargets).toBe(activeTargets);
    expect(generateId).not.toHaveBeenCalled();
    expect(out.nextBugSpawnAt).toBe(1_000 + baseConfig.spawnIntervalMs);
  });
});

describe('applyDespawnsForTick', () => {
  it('returns the same reference when no targets have expired', () => {
    const activeTargets: (Target | null)[] = [bug({ despawnAt: 2_000 }), null, null];
    const map = new Map<number, { target: Target; at: number }>();
    const out = applyDespawnsForTick({
      activeTargets,
      originalRef: activeTargets,
      now: 1_000,
      recentlyDespawned: map,
    });
    expect(out.activeTargets).toBe(activeTargets);
    expect(map.size).toBe(0);
  });

  it('clones the buffer once and clears expired slots, recording grace entries', () => {
    const expired = bug({ id: 'old', despawnAt: 500 });
    const fresh = bug({ id: 'new', despawnAt: 5_000 });
    const activeTargets: (Target | null)[] = [expired, fresh, null];
    const map = new Map<number, { target: Target; at: number }>();
    const out = applyDespawnsForTick({
      activeTargets,
      originalRef: activeTargets,
      now: 500,
      recentlyDespawned: map,
    });
    expect(out.activeTargets).not.toBe(activeTargets);
    expect(out.activeTargets[0]).toBeNull();
    expect(out.activeTargets[1]).toBe(fresh);
    expect(map.get(0)).toEqual({ target: expired, at: 500 });
    expect(activeTargets[0]).toBe(expired);
  });

  it('does not reclone when the buffer already differs from originalRef (spawn already cloned)', () => {
    const original: (Target | null)[] = [bug({ despawnAt: 500 }), null];
    const cloned = original.slice();
    const map = new Map<number, { target: Target; at: number }>();
    const out = applyDespawnsForTick({
      activeTargets: cloned,
      originalRef: original,
      now: 500,
      recentlyDespawned: map,
    });
    expect(out.activeTargets).toBe(cloned);
    expect(cloned[0]).toBeNull();
  });
});

describe('evictExpiredGraceEntries', () => {
  it('removes entries older than DESPAWN_GRACE_MS', () => {
    const map = new Map<number, { target: Target; at: number }>();
    map.set(0, { target: bug(), at: 0 });
    evictExpiredGraceEntries(map, DESPAWN_GRACE_MS + 1);
    expect(map.has(0)).toBe(false);
  });

  it('keeps entries exactly at the grace boundary', () => {
    const map = new Map<number, { target: Target; at: number }>();
    map.set(0, { target: bug(), at: 0 });
    evictExpiredGraceEntries(map, DESPAWN_GRACE_MS);
    expect(map.has(0)).toBe(true);
  });

  it('keeps fresh entries and drops only stale ones', () => {
    const map = new Map<number, { target: Target; at: number }>();
    map.set(0, { target: bug({ id: 'stale' }), at: 0 });
    map.set(1, { target: bug({ id: 'fresh' }), at: 100 });
    evictExpiredGraceEntries(map, 100 + DESPAWN_GRACE_MS);
    expect(map.has(0)).toBe(false);
    expect(map.get(1)?.target.id).toBe('fresh');
  });
});
