import type { GameMode } from '@common/types';

export type GameStatus = 'idle' | 'playing' | 'finished';

export type TargetKind = 'bug' | 'feature';

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
 */
export type ClickOutcome =
  | { kind: 'bug_squashed'; points: number; combo: number }
  | { kind: 'bug_cracked'; combo: number }
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

export type { GameMode };
