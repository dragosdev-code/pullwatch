import type { GameMode } from '../game-types';

export interface ModeMetadata {
  mode: GameMode;
  label: string;
  tagline: string;
}

/**
 * Display strings for the four launcher buttons. Kept separate from `MODE_CONFIGS` so the
 * mechanical config (durations, spawn intervals) does not accumulate UI strings, and so
 * future localization can replace this table without touching the engine.
 */
export const MODE_METADATA: readonly ModeMetadata[] = [
  { mode: 'standard', label: 'standard', tagline: 'three by three. thirty seconds. squash.' },
  { mode: 'legacy', label: 'legacy', tagline: 'two clicks per bug. crusty old codebase.' },
  {
    mode: 'scopeCreep',
    label: 'scope creep',
    tagline: 'grid grows as the deadline shrinks.',
  },
  {
    mode: 'fridayDeploy',
    label: 'friday deploy',
    tagline: 'fifteen seconds. triple spawn rate. good luck.',
  },
];
