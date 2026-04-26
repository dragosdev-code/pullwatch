import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  COMBO_SCORE_MULTIPLIER_CAP,
  HIT_STOP_MS,
  MODE_CONFIGS,
  PHASE_BASE_POINTS,
  POINTS_PER_FEATURE,
  SCREEN_SHAKE_MS,
  type ModeConfig,
} from './game-config';
import { computeBugPhase } from './game-phase';
import type {
  ClickOutcome,
  GameMode,
  GameStatus,
  LastClick,
  Target,
} from './game-types';

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
  /**
   * Earliest tick clock at which the bug spawner is allowed to fire.
   *
   * WHY [adaptive rhythm]: a successful squash sets this to `now`, so the very next tick spawns
   * a fresh bug. Effective bug cadence is therefore the player's reaction time, bounded below
   * by `config.spawnIntervalMs` for the case of no clicks.
   */
  nextBugSpawnAt: number;
  /**
   * Earliest tick clock at which the feature spawner is allowed to fire. Independent of the bug
   * timer so a hot squash streak does not drag features in with it.
   */
  nextFeatureSpawnAt: number;
  /** Most recent click outcome, kept for the canvas overlay to consume in Phase 4. */
  lastClick: LastClick | null;
  /** Monotonic per `startGame`, used to dedupe onFinish and stats in React StrictMode. */
  roundId: number;
  nextClickId: number;
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

let nextSessionRoundId = 0;

function getNextSessionRoundId(): number {
  nextSessionRoundId += 1;
  return nextSessionRoundId;
}

/** Test only: reset so each test file can assert predictable `roundId` from the first `startGame`. */
export function __resetSessionRoundIdForTests(): void {
  nextSessionRoundId = 0;
}

let fallbackIdCounter = 0;

function defaultIdGenerator(): string {
  fallbackIdCounter += 1;
  return `target_${fallbackIdCounter}`;
}

/** Indices of `null` slots in the target grid. */
function pickEmptyIndices(targets: (Target | null)[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < targets.length; i += 1) {
    if (targets[i] === null) out.push(i);
  }
  return out;
}

/** Select one index from `indices` using the injected `random` source. */
function pickOne(indices: number[], random: () => number): number {
  return indices[Math.min(indices.length - 1, Math.floor(random() * indices.length))];
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
    nextBugSpawnAt: 0,
    nextFeatureSpawnAt: 0,
    lastClick: null,
    roundId: 0,
    nextClickId: 0,
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
        nextBugSpawnAt: now + config.spawnIntervalMs,
        nextFeatureSpawnAt: now + config.featureSpawnIntervalMs,
        lastClick: null,
        roundId: getNextSessionRoundId(),
        nextClickId: 0,
      });
    },

    endGame() {
      const s = get();
      if (s.status !== 'playing') return;
      const elapsedMs = Math.max(0, s.config.durationMs - s.timeRemainingMs);
      set({
        status: 'finished',
        activeTargets: new Array(s.activeTargets.length).fill(null),
        elapsedMs: Math.min(s.config.durationMs, elapsedMs),
        timeRemainingMs: 0,
        lastClick: null,
        hitStopUntil: 0,
        shakeUntil: 0,
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

      /**
       * WHY [two independent spawn gates]: bugs and features each run on their own cadence so a
       * hot squash streak (which resets `nextBugSpawnAt` to `now`) does not drag features along.
       * Each gate scans empty cells independently — a bug and a feature may land in the same tick
       * if both timers fire, but they will never fight for the same cell because the second scan
       * sees the first spawn's mutation.
       */
      let nextBugSpawnAt = s.nextBugSpawnAt;
      let nextFeatureSpawnAt = s.nextFeatureSpawnAt;

      if (now >= nextBugSpawnAt) {
        const emptyCells = pickEmptyIndices(activeTargets);
        if (emptyCells.length > 0) {
          const cellIndex = pickOne(emptyCells, random);
          const target: Target = {
            id: generateId(),
            kind: 'bug',
            spawnedAt: now,
            despawnAt: now + s.config.targetLifetimeMs,
            damageStage: 0,
          };
          activeTargets = activeTargets.slice();
          activeTargets[cellIndex] = target;
        }
        nextBugSpawnAt = now + s.config.spawnIntervalMs;
      }

      if (now >= nextFeatureSpawnAt) {
        const emptyCells = pickEmptyIndices(activeTargets);
        if (emptyCells.length > 0) {
          const cellIndex = pickOne(emptyCells, random);
          const target: Target = {
            id: generateId(),
            kind: 'feature',
            spawnedAt: now,
            despawnAt: now + s.config.targetLifetimeMs,
            damageStage: 0,
          };
          activeTargets = activeTargets.slice();
          activeTargets[cellIndex] = target;
        }
        nextFeatureSpawnAt = now + s.config.featureSpawnIntervalMs;
      }

      if (timeRemainingMs <= 0) {
        set({
          elapsedMs,
          timeRemainingMs: 0,
          gridSize,
          activeTargets: new Array(activeTargets.length).fill(null),
          nextBugSpawnAt,
          nextFeatureSpawnAt,
          status: 'finished',
        });
        return;
      }

      set({
        elapsedMs,
        timeRemainingMs,
        gridSize,
        activeTargets,
        nextBugSpawnAt,
        nextFeatureSpawnAt,
      });
    },

    clickCell(cellIndex, now) {
      const s = get();
      if (s.status !== 'playing') {
        return { kind: 'noop' };
      }
      if (cellIndex < 0 || cellIndex >= s.activeTargets.length) {
        return { kind: 'noop' };
      }

      const target = s.activeTargets[cellIndex] ?? null;

      if (target === null) {
        const outcome: ClickOutcome = { kind: 'miss' };
        set((state) => {
          const id = state.nextClickId;
          return {
            combo: 0,
            shakeUntil: now + SCREEN_SHAKE_MS,
            lastClick: { id, outcome, cellIndex, at: now },
            nextClickId: id + 1,
          };
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
        set((state) => {
          const id = state.nextClickId;
          return {
            activeTargets: next,
            score: s.score + POINTS_PER_FEATURE,
            combo: 0,
            featuresBroken: s.featuresBroken + 1,
            shakeUntil: now + SCREEN_SHAKE_MS,
            lastClick: { id, outcome, cellIndex, at: now },
            nextClickId: id + 1,
          };
        });
        return outcome;
      }

      const phase = computeBugPhase(target, now, s.config.targetLifetimeMs);
      const remainingClicks = s.config.bugClicksToKill - target.damageStage - 1;
      if (remainingClicks > 0) {
        const next = s.activeTargets.slice();
        next[cellIndex] = { ...target, damageStage: target.damageStage + 1 };
        const outcome: ClickOutcome = { kind: 'bug_cracked', combo: s.combo, phase };
        set((state) => {
          const id = state.nextClickId;
          return {
            activeTargets: next,
            hitStopUntil: now + HIT_STOP_MS,
            lastClick: { id, outcome, cellIndex, at: now },
            nextClickId: id + 1,
          };
        });
        return outcome;
      }

      const next = s.activeTargets.slice();
      next[cellIndex] = null;
      const newCombo = s.combo + 1;
      const basePoints = PHASE_BASE_POINTS[phase];
      const multiplier = Math.min(COMBO_SCORE_MULTIPLIER_CAP, newCombo);
      const points = basePoints * multiplier;
      const outcome: ClickOutcome = {
        kind: 'bug_squashed',
        basePoints,
        multiplier,
        points,
        combo: newCombo,
        phase,
      };
      set((state) => {
        const id = state.nextClickId;
        return {
          activeTargets: next,
          score: s.score + points,
          combo: newCombo,
          highestCombo: Math.max(s.highestCombo, newCombo),
          bugsSquashed: s.bugsSquashed + 1,
          hitStopUntil: now + HIT_STOP_MS,
          lastClick: { id, outcome, cellIndex, at: now },
          nextClickId: id + 1,
          /**
           * WHY [adaptive rhythm]: reset the bug spawn timer so a new bug appears on the very next
           * tick. The player's reaction time becomes the effective cadence, bounded below by
           * `spawnIntervalMs` for the idle case (no clicks).
           */
          nextBugSpawnAt: now,
        };
      });
      return outcome;
    },
  }));
}
