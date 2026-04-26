import type { BugPhase, Target } from './game-types';

/**
 * Lifetime fraction breakpoints for the three bug phases. Even thirds:
 * `[0, 1/3) → fresh`, `[1/3, 2/3) → middle`, `[2/3, 1] → final`.
 */
export const PHASE_FRACTION_FRESH_TO_MIDDLE = 1 / 3;
export const PHASE_FRACTION_MIDDLE_TO_FINAL = 2 / 3;

/**
 * Derives the visual + scoring phase of a bug from its age relative to its lifetime.
 *
 * WHY [pure derivation]: phase is never stored on `Target`. Storing it would force `tick` to
 * mutate every target every frame to keep the value current; deriving on read keeps the store
 * write set small and removes a class of "phase went stale" bugs.
 *
 * WHY [clamp]: a click handler can fire before the next `tick` runs the despawn pass, so
 * `now > spawnedAt + lifetimeMs` is possible. Clamping keeps `final` as the last phase instead
 * of returning a fourth bucket.
 */
export function computeBugPhase(
  target: Pick<Target, 'spawnedAt'>,
  now: number,
  lifetimeMs: number
): BugPhase {
  if (lifetimeMs <= 0) return 'final';
  const elapsed = now - target.spawnedAt;
  const frac = Math.max(0, Math.min(1, elapsed / lifetimeMs));
  if (frac < PHASE_FRACTION_FRESH_TO_MIDDLE) return 'fresh';
  if (frac < PHASE_FRACTION_MIDDLE_TO_FINAL) return 'middle';
  return 'final';
}
