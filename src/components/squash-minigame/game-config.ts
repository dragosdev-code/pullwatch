import type { GameMode } from '@common/types';

/** Pause the simulation for this many ms after a successful bug squash, per spec. */
export const HIT_STOP_MS = 50;

/** Multi directional shake duration applied after a feature break or empty cell miss, per spec. */
export const SCREEN_SHAKE_MS = 300;

export const POINTS_PER_BUG = 10;
export const POINTS_PER_FEATURE = -20;

/** Fraction of spawns that produce a feature target instead of a bug, per spec (20 percent). */
export const FEATURE_SPAWN_PROBABILITY = 0.2;

/**
 * Schedule entry for variants that grow the grid mid round. `triggerAtRemainingMs` is checked
 * against the current `timeRemainingMs`; once the remaining time drops at or below the trigger,
 * `gridSize` becomes the new minimum grid size.
 */
export interface GridExpansionStage {
  triggerAtRemainingMs: number;
  gridSize: number;
}

export interface ModeConfig {
  initialGridSize: number;
  durationMs: number;
  spawnIntervalMs: number;
  targetLifetimeMs: number;
  /** Number of clicks needed to squash a bug. Legacy mode requires two; everything else is one. */
  bugClicksToKill: 1 | 2;
  /** Sorted ascending by `triggerAtRemainingMs` so iteration applies stages in order. */
  gridExpansionSchedule: GridExpansionStage[];
}

const STANDARD_DURATION_MS = 30_000;
const STANDARD_SPAWN_INTERVAL_MS = 750;
const STANDARD_TARGET_LIFETIME_MS = 1100;

export const MODE_CONFIGS: Record<GameMode, ModeConfig> = {
  standard: {
    initialGridSize: 3,
    durationMs: STANDARD_DURATION_MS,
    spawnIntervalMs: STANDARD_SPAWN_INTERVAL_MS,
    targetLifetimeMs: STANDARD_TARGET_LIFETIME_MS,
    bugClicksToKill: 1,
    gridExpansionSchedule: [],
  },
  legacy: {
    initialGridSize: 3,
    durationMs: STANDARD_DURATION_MS,
    spawnIntervalMs: 850,
    targetLifetimeMs: 1500,
    bugClicksToKill: 2,
    gridExpansionSchedule: [],
  },
  scopeCreep: {
    initialGridSize: 3,
    durationMs: STANDARD_DURATION_MS,
    spawnIntervalMs: STANDARD_SPAWN_INTERVAL_MS,
    targetLifetimeMs: STANDARD_TARGET_LIFETIME_MS,
    bugClicksToKill: 1,
    gridExpansionSchedule: [
      { triggerAtRemainingMs: 20_000, gridSize: 4 },
      { triggerAtRemainingMs: 10_000, gridSize: 5 },
    ],
  },
  fridayDeploy: {
    initialGridSize: 3,
    durationMs: 15_000,
    spawnIntervalMs: 250,
    targetLifetimeMs: 400,
    bugClicksToKill: 1,
    gridExpansionSchedule: [],
  },
};
