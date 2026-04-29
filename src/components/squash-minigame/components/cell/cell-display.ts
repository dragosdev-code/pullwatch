import type { BugPhase, Target } from '../../game-types';

/**
 * Map a bug's lifetime phase to a DaisyUI `bg-warning` opacity tier.
 *
 * WHY [three tiers]: the phase is a visual cue that aligns with the scoring system —
 * fresh (10pt) is brightest, final (2pt) is dimmest, nudging the player to click sooner.
 */
export const PHASE_BG: Record<BugPhase, string> = {
  fresh: 'bg-warning',
  middle: 'bg-warning/65',
  final: 'bg-warning/35',
};

export function getCellLabel(target: Target | null): string {
  if (target === null) return '';
  if (target.kind === 'feature') return 'feature';
  if (target.damageStage > 0) return 'cracked bug';
  return 'bug';
}

export function getCellGlyph(target: Target | null): string {
  if (target === null) return '';
  if (target.kind === 'feature') return 'feat';
  return 'bug';
}
