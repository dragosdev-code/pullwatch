import type { MinigameSessionCheckpoint } from '@common/types';
import type { GameState } from './game-store';

/**
 * Build a checkpoint snapshot from the current store state. Returns `null` if the game is not
 * in the `playing` state (nothing to save).
 *
 * WHY [separate function]: keeps checkpoint construction out of the store action layer and
 * the component layer. Both `closeSquashGame` (provider) and future `visibilitychange` hooks
 * can call this without duplicating the field mapping.
 */
export function buildCheckpointFromState(
  state: Pick<
    GameState,
    | 'status'
    | 'mode'
    | 'score'
    | 'combo'
    | 'highestCombo'
    | 'bugsSquashed'
    | 'featuresBroken'
    | 'elapsedMs'
    | 'timeRemainingMs'
    | 'gridSize'
  >,
  now: number
): MinigameSessionCheckpoint | null {
  if (state.status !== 'playing') return null;

  return {
    mode: state.mode,
    score: state.score,
    combo: state.combo,
    highestCombo: state.highestCombo,
    bugsSquashed: state.bugsSquashed,
    featuresBroken: state.featuresBroken,
    elapsedMs: state.elapsedMs,
    timeRemainingMs: state.timeRemainingMs,
    gridSize: state.gridSize,
    savedAt: now,
  };
}
