import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  FEATURE_SPAWN_PROBABILITY,
  HIT_STOP_MS,
  MODE_CONFIGS,
  POINTS_PER_BUG,
  POINTS_PER_FEATURE,
  SCREEN_SHAKE_MS,
  type ModeConfig,
} from './game-config';
import type { ClickOutcome, GameMode, GameStatus, LastClick, Target } from './game-types';

export interface GameState {
  mode: GameMode;
  status: GameStatus;
  config: ModeConfig;
  gridSize: number;
  /** One slot per cell, indexed left to right top to bottom. `null` means the cell is empty. */
  activeTargets: (Target | null)[];
  score: number;
  combo: number;
  highestCombo: number;
  bugsSquashed: number;
  featuresBroken: number;
  startedAt: number;
  elapsedMs: number;
  timeRemainingMs: number;
  /** Simulation pauses while `now < hitStopUntil`. The loop keeps spinning so renders continue. */
  hitStopUntil: number;
  /** Render layer reads this to apply the shake transform until `now >= shakeUntil`. */
  shakeUntil: number;
  nextSpawnAt: number;
  /** Most recent click outcome, kept for the canvas overlay to consume in Phase 4. */
  lastClick: LastClick | null;
}

export interface GameActions {
  startGame(mode: GameMode, now: number): void;
  endGame(): void;
  reset(): void;
  tick(now: number): void;
  clickCell(cellIndex: number, now: number): ClickOutcome;
}

export type GameStore = StoreApi<GameState & GameActions>;

export interface GameStoreDeps {
  random?: () => number;
  generateId?: () => string;
}

let fallbackIdCounter = 0;

function defaultIdGenerator(): string {
  fallbackIdCounter += 1;
  return `target_${fallbackIdCounter}`;
}

function buildIdleState(): GameState {
  const config = MODE_CONFIGS.standard;
  return {
    mode: 'standard',
    status: 'idle',
    config,
    gridSize: config.initialGridSize,
    activeTargets: new Array(config.initialGridSize ** 2).fill(null),
    score: 0,
    combo: 0,
    highestCombo: 0,
    bugsSquashed: 0,
    featuresBroken: 0,
    startedAt: 0,
    elapsedMs: 0,
    timeRemainingMs: 0,
    hitStopUntil: 0,
    shakeUntil: 0,
    nextSpawnAt: 0,
    lastClick: null,
  };
}

/**
 * Creates a fresh vanilla zustand store driving a single game session.
 *
 * WHY [vanilla over react]: the game loop runs at the display refresh rate via
 * requestAnimationFrame. Decoupling the store from React (no `create` from `zustand`) means the
 * loop can mutate state without queueing React renders for non subscribed slices. React cells
 * subscribe atomically in Phase 3 via `useStore(store, s => s.activeTargets[index])`.
 *
 * WHY [injectable random and id]: deterministic test runs require seeded spawns. Production code
 * uses Math.random and a monotonic counter, both replaced through `deps`.
 */
export function createGameStore(deps: GameStoreDeps = {}): GameStore {
  const random = deps.random ?? Math.random;
  const generateId = deps.generateId ?? defaultIdGenerator;

  return createStore<GameState & GameActions>((set, get) => ({
    ...buildIdleState(),

    startGame(mode, now) {
      const config = MODE_CONFIGS[mode];
      set({
        mode,
        status: 'playing',
        config,
        gridSize: config.initialGridSize,
        activeTargets: new Array(config.initialGridSize ** 2).fill(null),
        score: 0,
        combo: 0,
        highestCombo: 0,
        bugsSquashed: 0,
        featuresBroken: 0,
        startedAt: now,
        elapsedMs: 0,
        timeRemainingMs: config.durationMs,
        hitStopUntil: 0,
        shakeUntil: 0,
        nextSpawnAt: now + config.spawnIntervalMs,
        lastClick: null,
      });
    },

    endGame() {
      const s = get();
      set({
        status: 'finished',
        activeTargets: new Array(s.activeTargets.length).fill(null),
      });
    },

    reset() {
      set(buildIdleState());
    },

    tick(now) {
      const s = get();
      if (s.status !== 'playing') return;
      if (now < s.hitStopUntil) return;

      const elapsedMs = now - s.startedAt;
      const timeRemainingMs = Math.max(0, s.config.durationMs - elapsedMs);

      let gridSize = s.gridSize;
      for (const stage of s.config.gridExpansionSchedule) {
        if (timeRemainingMs <= stage.triggerAtRemainingMs && stage.gridSize > gridSize) {
          gridSize = stage.gridSize;
        }
      }

      let activeTargets = s.activeTargets;
      const desiredCellCount = gridSize ** 2;
      if (desiredCellCount > activeTargets.length) {
        activeTargets = activeTargets.concat(
          new Array(desiredCellCount - activeTargets.length).fill(null)
        );
      }

      let despawnMutated = false;
      const afterDespawn = activeTargets.map((target) => {
        if (target && target.despawnAt <= now) {
          despawnMutated = true;
          return null;
        }
        return target;
      });
      if (despawnMutated) {
        activeTargets = afterDespawn;
      }

      let nextSpawnAt = s.nextSpawnAt;
      if (now >= nextSpawnAt) {
        const emptyIndices: number[] = [];
        for (let i = 0; i < activeTargets.length; i += 1) {
          if (activeTargets[i] === null) emptyIndices.push(i);
        }
        if (emptyIndices.length > 0) {
          const cellPick = Math.min(
            emptyIndices.length - 1,
            Math.floor(random() * emptyIndices.length)
          );
          const cellIndex = emptyIndices[cellPick];
          const isFeature = random() < FEATURE_SPAWN_PROBABILITY;
          const target: Target = {
            id: generateId(),
            kind: isFeature ? 'feature' : 'bug',
            spawnedAt: now,
            despawnAt: now + s.config.targetLifetimeMs,
            damageStage: 0,
          };
          activeTargets = activeTargets.slice();
          activeTargets[cellIndex] = target;
        }
        nextSpawnAt = now + s.config.spawnIntervalMs;
      }

      if (timeRemainingMs <= 0) {
        set({
          elapsedMs,
          timeRemainingMs: 0,
          gridSize,
          activeTargets: new Array(activeTargets.length).fill(null),
          nextSpawnAt,
          status: 'finished',
        });
        return;
      }

      set({
        elapsedMs,
        timeRemainingMs,
        gridSize,
        activeTargets,
        nextSpawnAt,
      });
    },

    clickCell(cellIndex, now) {
      const s = get();
      if (s.status !== 'playing') {
        return { kind: 'noop' };
      }

      const target = s.activeTargets[cellIndex] ?? null;

      if (target === null) {
        const outcome: ClickOutcome = { kind: 'miss' };
        set({
          combo: 0,
          shakeUntil: now + SCREEN_SHAKE_MS,
          lastClick: { outcome, cellIndex, at: now },
        });
        return outcome;
      }

      if (target.kind === 'feature') {
        const next = s.activeTargets.slice();
        next[cellIndex] = null;
        const outcome: ClickOutcome = {
          kind: 'feature_broken',
          points: POINTS_PER_FEATURE,
        };
        set({
          activeTargets: next,
          score: s.score + POINTS_PER_FEATURE,
          combo: 0,
          featuresBroken: s.featuresBroken + 1,
          shakeUntil: now + SCREEN_SHAKE_MS,
          lastClick: { outcome, cellIndex, at: now },
        });
        return outcome;
      }

      const remainingClicks = s.config.bugClicksToKill - target.damageStage - 1;
      if (remainingClicks > 0) {
        const next = s.activeTargets.slice();
        next[cellIndex] = { ...target, damageStage: target.damageStage + 1 };
        const outcome: ClickOutcome = { kind: 'bug_cracked', combo: s.combo };
        set({
          activeTargets: next,
          hitStopUntil: now + HIT_STOP_MS,
          lastClick: { outcome, cellIndex, at: now },
        });
        return outcome;
      }

      const next = s.activeTargets.slice();
      next[cellIndex] = null;
      const newCombo = s.combo + 1;
      const outcome: ClickOutcome = {
        kind: 'bug_squashed',
        points: POINTS_PER_BUG,
        combo: newCombo,
      };
      set({
        activeTargets: next,
        score: s.score + POINTS_PER_BUG,
        combo: newCombo,
        highestCombo: Math.max(s.highestCombo, newCombo),
        bugsSquashed: s.bugsSquashed + 1,
        hitStopUntil: now + HIT_STOP_MS,
        lastClick: { outcome, cellIndex, at: now },
      });
      return outcome;
    },
  }));
}
