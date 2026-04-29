import { DESPAWN_GRACE_MS, type ModeConfig } from './game-config';
import type { Target } from './game-types';

/**
 * Helpers extracted from `createGameStore`'s `tick` orchestrator. Each helper owns one named
 * step from the tick spec and is intentionally narrow:
 *
 *   expansion -> resize buffer -> spawn (gated on !grew) -> despawn -> grace eviction
 *
 * The helpers MUST stay pure with respect to `GameState` (no `set` / `get`); the orchestrator in
 * `game-store.ts` keeps end-to-end ordering and is the single place that mutates the store.
 *
 * `recentlyDespawned` lives in the `createGameStore` closure, NOT on `GameState`. It is passed in
 * as an argument to the helpers that touch it.
 */

/** Indices of `null` slots in the target grid. */
export function pickEmptyIndices(targets: ReadonlyArray<Target | null>): number[] {
  const out: number[] = [];
  for (let i = 0; i < targets.length; i += 1) {
    if (targets[i] === null) out.push(i);
  }
  return out;
}

/** Select one index from `indices` using the injected `random` source. */
export function pickOne(indices: number[], random: () => number): number {
  return indices[Math.min(indices.length - 1, Math.floor(random() * indices.length))];
}

export interface ExpansionResult {
  gridSize: number;
  grew: boolean;
}

/**
 * Step 1: derive next gridSize from the schedule. Returns `grew=true` iff the size changed
 * relative to `prevGridSize`; the spawn step uses this as a one-tick cooldown.
 */
export function computeExpansionResult(
  prevGridSize: number,
  config: ModeConfig,
  timeRemainingMs: number
): ExpansionResult {
  let gridSize = prevGridSize;
  for (const stage of config.gridExpansionSchedule) {
    if (timeRemainingMs <= stage.triggerAtRemainingMs && stage.gridSize > gridSize) {
      gridSize = stage.gridSize;
    }
  }
  return { gridSize, grew: gridSize !== prevGridSize };
}

/**
 * Step 2: pad `activeTargets` to `gridSize²`. Returns the SAME reference when no growth is
 * needed so downstream copy-on-write checks (despawn) can rely on identity.
 */
export function resizeTargetBuffer(
  activeTargets: (Target | null)[],
  gridSize: number
): (Target | null)[] {
  const desiredCellCount = gridSize ** 2;
  if (desiredCellCount > activeTargets.length) {
    return activeTargets.concat(new Array(desiredCellCount - activeTargets.length).fill(null));
  }
  return activeTargets;
}

export interface SpawnInput {
  grew: boolean;
  now: number;
  config: ModeConfig;
  activeTargets: (Target | null)[];
  nextBugSpawnAt: number;
  nextFeatureSpawnAt: number;
  random: () => number;
  generateId: () => string;
}

export interface SpawnResult {
  activeTargets: (Target | null)[];
  nextBugSpawnAt: number;
  nextFeatureSpawnAt: number;
}

/**
 * Step 3: bug gate then feature gate. Skips entirely when `grew` so the layout settles for one
 * frame after expansion. Each timer is consumed (advanced by its interval) when it fires, even
 * if there is no empty cell to spawn into — matches the original behaviour exactly.
 *
 * WHY [bug then feature, two scans]: feature scan sees the bug spawn's mutation, so they cannot
 * collide on the same cell. Order matters; do not parallelise.
 */
export function runSpawnForTick(input: SpawnInput): SpawnResult {
  let activeTargets = input.activeTargets;
  let nextBugSpawnAt = input.nextBugSpawnAt;
  let nextFeatureSpawnAt = input.nextFeatureSpawnAt;

  if (input.grew) {
    return { activeTargets, nextBugSpawnAt, nextFeatureSpawnAt };
  }

  if (input.now >= nextBugSpawnAt) {
    const emptyCells = pickEmptyIndices(activeTargets);
    if (emptyCells.length > 0) {
      const cellIndex = pickOne(emptyCells, input.random);
      const target: Target = {
        id: input.generateId(),
        kind: 'bug',
        spawnedAt: input.now,
        despawnAt: input.now + input.config.targetLifetimeMs,
        damageStage: 0,
      };
      activeTargets = activeTargets.slice();
      activeTargets[cellIndex] = target;
    }
    nextBugSpawnAt = input.now + input.config.spawnIntervalMs;
  }

  if (input.now >= nextFeatureSpawnAt) {
    const emptyCells = pickEmptyIndices(activeTargets);
    if (emptyCells.length > 0) {
      const cellIndex = pickOne(emptyCells, input.random);
      const target: Target = {
        id: input.generateId(),
        kind: 'feature',
        spawnedAt: input.now,
        despawnAt: input.now + input.config.targetLifetimeMs,
        damageStage: 0,
      };
      activeTargets = activeTargets.slice();
      activeTargets[cellIndex] = target;
    }
    nextFeatureSpawnAt = input.now + input.config.featureSpawnIntervalMs;
  }

  return { activeTargets, nextBugSpawnAt, nextFeatureSpawnAt };
}

export interface DespawnInput {
  activeTargets: (Target | null)[];
  /** The buffer reference held by the store BEFORE this tick mutated anything. */
  originalRef: (Target | null)[];
  now: number;
  recentlyDespawned: Map<number, { target: Target; at: number }>;
}

export interface DespawnResult {
  activeTargets: (Target | null)[];
}

/**
 * Step 4: clear expired targets from the grid and record them in the `recentlyDespawned` map so
 * `clickCell` can honour clicks within the grace window.
 *
 * WHY [copy-on-write keyed on originalRef]: spawn may have already cloned the buffer; we only
 * clone again on the first despawn if `activeTargets` still aliases the store's previous ref.
 * Keeping the rule shaped this way preserves the "spawn-then-despawn" identity semantics that
 * tick_ordering depends on.
 */
export function applyDespawnsForTick(input: DespawnInput): DespawnResult {
  let activeTargets = input.activeTargets;
  for (let i = 0; i < activeTargets.length; i += 1) {
    const target = activeTargets[i];
    if (target && target.despawnAt <= input.now) {
      input.recentlyDespawned.set(i, { target, at: input.now });
      if (activeTargets === input.originalRef) {
        activeTargets = activeTargets.slice();
      }
      activeTargets[i] = null;
    }
  }
  return { activeTargets };
}

/**
 * Step 4b: drop grace entries older than `DESPAWN_GRACE_MS`. Mutates the map in place — the map
 * is closure-scoped in `createGameStore` so there is no React state to invalidate.
 */
export function evictExpiredGraceEntries(
  recentlyDespawned: Map<number, { target: Target; at: number }>,
  now: number
): void {
  for (const [idx, entry] of recentlyDespawned) {
    if (now - entry.at > DESPAWN_GRACE_MS) {
      recentlyDespawned.delete(idx);
    }
  }
}
