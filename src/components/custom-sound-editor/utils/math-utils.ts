import { MAX_CUSTOM_SOUND_DURATION_S } from '../../../../extension/common/constants';

/**
 * Clamps a new trim-start time so the selection stays valid.
 *
 * WHY the floor is `max(0, currentEndS - MAX_DURATION)`: the user must not
 * create a selection longer than the upload limit, even by dragging start
 * leftward past the allowed window. The minimum gap of 0.1s prevents a
 * zero-length selection which would produce silence.
 */
export const clampStartS = (next: number, currentEndS: number): number => {
  const capped = Math.min(next, currentEndS - 0.1);
  const floor = Math.max(0, currentEndS - MAX_CUSTOM_SOUND_DURATION_S);
  return Math.max(floor, Math.max(0, capped));
};

/**
 * Clamps a new trim-end time so the selection stays valid.
 *
 * WHY the cap is `min(dur, currentStartS + MAX_DURATION)`: mirrors
 * clampStartS — the user must not stretch the selection beyond the
 * maximum allowed custom sound duration by dragging end rightward.
 */
export const clampEndS = (next: number, currentStartS: number, dur: number): number => {
  const floored = Math.max(next, currentStartS + 0.1);
  const cap = Math.min(dur, currentStartS + MAX_CUSTOM_SOUND_DURATION_S);
  return Math.min(cap, Math.min(dur, floored));
};

/**
 * Slides the entire trim window (preserving its length) within [0, dur].
 *
 * WHY this is separate from start/end clamps: when the user drags the
 * center region, both boundaries move together. Clamping each independently
 * would change the selection length at the edges; this function preserves
 * the length by clamping the start position and deriving end from it.
 */
export const clampMoveWindow = (
  nextStart: number,
  length: number,
  dur: number,
): { startS: number; endS: number } => {
  const s = Math.max(0, Math.min(nextStart, dur - length));
  return { startS: s, endS: s + length };
};
