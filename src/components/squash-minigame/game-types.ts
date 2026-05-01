import type { GameMode } from '@common/types';

export type GameStatus = 'idle' | 'playing' | 'finished';

export type TargetKind = 'bug' | 'feature';

/**
 * Lifetime phase of a bug. Derived from `(now - spawnedAt) / lifetimeMs` via
 * {@link import('./game-phase').computeBugPhase}; never stored on `Target`. Each phase has its
 * own base point value (10 / 5 / 2) and visual opacity tier.
 */
export type BugPhase = 'fresh' | 'middle' | 'final';

/**
 * One target occupying a single grid cell. `damageStage` advances on each successful click and
 * is only meaningful when the active mode requires more than one click to kill (legacy variant).
 */
export interface Target {
  id: string;
  kind: TargetKind;
  spawnedAt: number;
  despawnAt: number;
  damageStage: number;
}

/**
 * Result of a single click on a cell. The store mutates state regardless; the outcome is also
 * stored on `lastClick` so the canvas overlay (Phase 4) can render Floating Combat Text without
 * polling the full store on every frame.
 *
 * WHY [bug_squashed carries basePoints + multiplier + points]: the combo multiplier is applied
 * in `clickCell`, but downstream consumers (FCT, audio) need the breakdown. `points` is the
 * actual amount added to score (`basePoints * multiplier`); `basePoints` reflects the phase tier
 * (10 / 5 / 2); `multiplier` is the capped combo. Keeping all three avoids re-derivation drift.
 */
export type ClickOutcome =
  | {
      kind: 'bug_squashed';
      basePoints: number;
      multiplier: number;
      points: number;
      combo: number;
      phase: BugPhase;
    }
  | { kind: 'bug_cracked'; combo: number; phase: BugPhase }
  | { kind: 'feature_broken'; points: number }
  | { kind: 'miss' }
  | { kind: 'noop' };

export interface LastClick {
  /** Monotonically increasing within a play session; consumers dedupe FCT and audio on this, not on `at`. */
  id: number;
  outcome: ClickOutcome;
  cellIndex: number;
  at: number;
}

/** Payload for `SquashMinigameProps.onFinish` and persisted round stats. */
export interface FinishedRoundSummary {
  mode: GameMode;
  roundId: number;
  score: number;
  highestCombo: number;
  bugsSquashed: number;
  featuresBroken: number;
  durationSeconds: number;
}

/** Parent-supplied persist result for this `roundId` (new-best banner + score runway). */
export interface FinishCelebration {
  roundId: number;
  isNewHighScore: boolean;
  previousHighScore: number;
}

export type { GameMode };
