import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  COMBO_SCORE_MULTIPLIER_CAP,
  DESPAWN_GRACE_MS,
  HIT_STOP_MS,
  MODE_CONFIGS,
  PHASE_BASE_POINTS,
  POINTS_PER_FEATURE,
  SCREEN_SHAKE_MS,
  type ModeConfig,
} from './game-config';
import { computeBugPhase } from './game-phase';
import {
  applyDespawnsForTick,
  computeExpansionResult,
  evictExpiredGraceEntries,
  resizeTargetBuffer,
  runSpawnForTick,
} from './game-tick';
import type {
  ClickOutcome,
  GameMode,
  GameStatus,
  LastClick,
  Target,
} from './game-types';
import type { MinigameSessionCheckpoint } from '@common/types';

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
  /**
   * Restore a round from a persisted checkpoint. Rebuilds timer and counters but does NOT
   * restore individual targets (they would be stale). The normal spawn cadence fills the grid
   * naturally on the next tick.
   */
  resumeFromCheckpoint(checkpoint: MinigameSessionCheckpoint, now: number): void;
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

  /**
   * WHY [closure-scoped, not in GameState]: `recentlyDespawned` is a transient lookup that only
   * lives between a despawn tick and the next click handler invocation. Storing a `Map` in zustand
   * state would break shallow-equality checks and force React re-renders on every tick that
   * despawns anything. Keeping it in the closure avoids both problems.
   */
  const recentlyDespawned = new Map<number, { target: Target; at: number }>();

  return createStore<GameState & GameActions>((set, get) => ({
    ...buildIdleState(),

    startGame(mode, now) {
      const config = MODE_CONFIGS[mode];
      recentlyDespawned.clear();
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

    /**
     * Restore from a checkpoint saved by the experience provider on popup close.
     *
     * WHY [no target restore]: persisting each target's spawn/despawn times would be fragile
     * (they reference `performance.now()` which resets across popup opens). Starting with an
     * empty grid and letting the spawn cadence fill it naturally is safer and feels seamless
     * since the first bug spawns within `spawnIntervalMs`.
     */
    resumeFromCheckpoint(checkpoint, now) {
      const config = MODE_CONFIGS[checkpoint.mode];
      recentlyDespawned.clear();
      set({
        mode: checkpoint.mode,
        status: 'playing',
        config,
        gridSize: checkpoint.gridSize,
        activeTargets: new Array(checkpoint.gridSize ** 2).fill(null),
        score: checkpoint.score,
        combo: checkpoint.combo,
        highestCombo: checkpoint.highestCombo,
        bugsSquashed: checkpoint.bugsSquashed,
        featuresBroken: checkpoint.featuresBroken,
        startedAt: now - checkpoint.elapsedMs,
        elapsedMs: checkpoint.elapsedMs,
        timeRemainingMs: checkpoint.timeRemainingMs,
        hitStopUntil: 0,
        shakeUntil: 0,
        nextBugSpawnAt: now + config.spawnIntervalMs,
        nextFeatureSpawnAt: now + config.featureSpawnIntervalMs,
        lastClick: null,
        roundId: getNextSessionRoundId(),
        nextClickId: 0,
      });
    },

    reset() {
      set(buildIdleState());
    },

    /**
     * Advance the simulation by one frame. This function is the SINGLE owner of end-to-end tick
     * ordering: each step lives in `./game-tick.ts` as a typed helper, and this orchestrator
     * sequences them and commits the result. Do not split phase ownership across multiple
     * top-level mutators — it would let phases reorder.
     *
     * WHY [tick ordering — expand → resize → spawn → despawn → finished]:
     *
     * 1. **Expansion first** so the grid is sized before anything lands in the new cells.
     * 2. **Resize buffer** pads `activeTargets` to match the new `gridSize²`.
     * 3. **Spawn gated on `!grew`**: if the grid just expanded this tick, skip spawning so the
     *    layout settles (React needs one render to size the new cells) before targets appear.
     *    Bug and feature timers are independent; each is consumed when it fires even if no empty
     *    cell is available, so a full grid does not stack pending spawns.
     * 4. **Despawn last** (after spawn): a target that expires on this tick is still in the
     *    array when the spawn gate runs, preserving its cell as occupied. More importantly,
     *    the target is still visible to any click handler that fires between the previous
     *    paint and this tick. Despawning moves the target into `recentlyDespawned` so
     *    `clickCell` can honour it within `DESPAWN_GRACE_MS`.
     * 5. **Finished check** at the very end so all mutations (including the final despawn
     *    sweep) are reflected in the committed state.
     */
    tick(now) {
      const s = get();
      if (s.status !== 'playing') return;
      if (now < s.hitStopUntil) return;

      const elapsedMs = now - s.startedAt;
      const timeRemainingMs = Math.max(0, s.config.durationMs - elapsedMs);

      // 1. expansion
      const { gridSize, grew } = computeExpansionResult(s.gridSize, s.config, timeRemainingMs);

      // 2. resize buffer (returns same ref when no growth needed; despawn relies on identity)
      const resizedTargets = resizeTargetBuffer(s.activeTargets, gridSize);

      // 3. spawn (skipped on grow tick; each timer consumed when it fires)
      const spawnResult = runSpawnForTick({
        grew,
        now,
        config: s.config,
        activeTargets: resizedTargets,
        nextBugSpawnAt: s.nextBugSpawnAt,
        nextFeatureSpawnAt: s.nextFeatureSpawnAt,
        random,
        generateId,
      });

      // 4. despawn (after spawn so same-frame clicks still see expiring targets)
      const { activeTargets } = applyDespawnsForTick({
        activeTargets: spawnResult.activeTargets,
        originalRef: s.activeTargets,
        now,
        recentlyDespawned,
      });

      // 4b. evict stale grace entries (mutates closure-scoped map)
      evictExpiredGraceEntries(recentlyDespawned, now);

      const nextBugSpawnAt = spawnResult.nextBugSpawnAt;
      const nextFeatureSpawnAt = spawnResult.nextFeatureSpawnAt;

      // 5. finished check
      if (timeRemainingMs <= 0) {
        recentlyDespawned.clear();
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

      let target = s.activeTargets[cellIndex] ?? null;

      /**
       * WHY [recentlyDespawned fallback]: if the RAF tick despawned a target between the
       * browser paint and this click handler, the cell reads as `null` even though the player
       * visually clicked a target. The grace map lets us honour the click within DESPAWN_GRACE_MS.
       */
      if (target === null) {
        const grace = recentlyDespawned.get(cellIndex);
        if (grace && now - grace.at <= DESPAWN_GRACE_MS) {
          target = grace.target;
          recentlyDespawned.delete(cellIndex);
        }
      }

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
