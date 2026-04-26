import type { GameMode, MinigameStats } from '@common/types';

export interface RoundResult {
  /**
   * Unique for each `startGame` in the session. Deduplication for `useRecordRoundResult` and
   * `onFinish` uses this; it is not persisted into MinigameStats.
   */
  roundId: number;
  mode: GameMode;
  score: number;
  highestCombo: number;
  bugsSquashed: number;
  featuresBroken: number;
  durationSeconds: number;
}

/**
 * Folds a finished round into the stored stats. Pure so callers (the shell, the launcher, and
 * the tests) can compose it without touching storage. Storage IO lives in
 * {@link import('./minigame-stats-storage').writeMinigameStats}.
 *
 * WHY [single function]: keeping the merge pure means the storage layer stays a thin read-modify-write
 * loop; concurrency safety on chrome.storage is the storage layer's job, not this module's.
 */
export function applyRoundResultToStats(stats: MinigameStats, result: RoundResult): MinigameStats {
  const prevMode = stats.modes[result.mode];
  return {
    ...stats,
    lastPlayedMode: result.mode,
    overall: {
      totalBugsSquashed: stats.overall.totalBugsSquashed + result.bugsSquashed,
      totalFeaturesBroken: stats.overall.totalFeaturesBroken + result.featuresBroken,
      totalTimePlayedSeconds:
        stats.overall.totalTimePlayedSeconds + Math.max(0, Math.round(result.durationSeconds)),
    },
    modes: {
      ...stats.modes,
      [result.mode]: {
        playCount: prevMode.playCount + 1,
        highScore: Math.max(prevMode.highScore, result.score),
        highestCombo: Math.max(prevMode.highestCombo, result.highestCombo),
      },
    },
  };
}
