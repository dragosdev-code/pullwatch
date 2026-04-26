import type { MinigameModeStats, MinigameStats } from '@common/types';
import type { GameMode } from '../game-types';

const ZERO_MODE_STATS: MinigameModeStats = {
  playCount: 0,
  highScore: 0,
  highestCombo: 0,
};

/**
 * Current schema version for MinigameStats. Bump this and add a migration case
 * in ensureCompleteMinigameStats whenever a field is added or renamed.
 */
export const CURRENT_MINIGAME_STATS_VERSION = 2;

const ALL_GAME_MODES: readonly GameMode[] = [
  'standard',
  'legacy',
  'scopeCreep',
  'fridayDeploy',
] as const;

/**
 * Canonical zero state for the Squash the Bugs minigame.
 *
 * WHY [frozen]: callers always go through {@link ensureCompleteMinigameStats}, which deep clones,
 * so this constant is safe to freeze and reuse without risk of accidental mutation.
 */
export const DEFAULT_MINIGAME_STATS: MinigameStats = Object.freeze({
  dataVersion: CURRENT_MINIGAME_STATS_VERSION,
  hasDiscovered: false,
  hasSeenSquashQuickStart: false,
  popupOpenCount: 0,
  overall: Object.freeze({
    totalBugsSquashed: 0,
    totalFeaturesBroken: 0,
    totalTimePlayedSeconds: 0,
  }),
  modes: Object.freeze({
    standard: { ...ZERO_MODE_STATS },
    legacy: { ...ZERO_MODE_STATS },
    scopeCreep: { ...ZERO_MODE_STATS },
    fridayDeploy: { ...ZERO_MODE_STATS },
  }),
}) as MinigameStats;

function cloneModeStats(stats: Partial<MinigameModeStats> | undefined): MinigameModeStats {
  return {
    playCount: stats?.playCount ?? ZERO_MODE_STATS.playCount,
    highScore: stats?.highScore ?? ZERO_MODE_STATS.highScore,
    highestCombo: stats?.highestCombo ?? ZERO_MODE_STATS.highestCombo,
  };
}

/**
 * Merges a partial stored value onto {@link DEFAULT_MINIGAME_STATS}, returning a fresh object
 * the caller can safely mutate.
 *
 * WHY [shape healing]: storage may pre-date a field added in a later release; we want the popup
 * and tests to read a complete, well-typed object instead of crashing on `undefined.modes.legacy`.
 *
 * WHY [defensive deep clone]: the returned object must never share references with
 * {@link DEFAULT_MINIGAME_STATS}; otherwise an in-place mutation by a caller would poison every
 * subsequent read.
 */
export function ensureCompleteMinigameStats(
  partial: Partial<MinigameStats> | null | undefined
): MinigameStats {
  const base = partial ?? {};
  const incomingModes = base.modes ?? ({} as Partial<Record<GameMode, MinigameModeStats>>);

  const modes = {} as Record<GameMode, MinigameModeStats>;
  for (const mode of ALL_GAME_MODES) {
    modes[mode] = cloneModeStats(incomingModes[mode]);
  }

  return {
    dataVersion: base.dataVersion ?? CURRENT_MINIGAME_STATS_VERSION,
    hasDiscovered: base.hasDiscovered ?? DEFAULT_MINIGAME_STATS.hasDiscovered,
    hasSeenSquashQuickStart:
      base.hasSeenSquashQuickStart ?? DEFAULT_MINIGAME_STATS.hasSeenSquashQuickStart,
    popupOpenCount: base.popupOpenCount ?? DEFAULT_MINIGAME_STATS.popupOpenCount,
    lastPlayedMode: base.lastPlayedMode,
    overall: {
      totalBugsSquashed:
        base.overall?.totalBugsSquashed ?? DEFAULT_MINIGAME_STATS.overall.totalBugsSquashed,
      totalFeaturesBroken:
        base.overall?.totalFeaturesBroken ?? DEFAULT_MINIGAME_STATS.overall.totalFeaturesBroken,
      totalTimePlayedSeconds:
        base.overall?.totalTimePlayedSeconds ??
        DEFAULT_MINIGAME_STATS.overall.totalTimePlayedSeconds,
    },
    modes,
  };
}
