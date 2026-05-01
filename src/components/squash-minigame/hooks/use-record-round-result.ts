import { useCallback } from 'react';
import {
  applyRoundResultToStats,
  isNewHighScoreForRound,
  type RoundResult,
} from '../storage/record-round-result';
import { readMinigameStats, writeMinigameStats } from '../storage/minigame-stats-storage';

export type RecordRoundPersistOutcome = { isNewHighScore: boolean; previousHighScore: number };

const pendingRoundIds = new Set<number>();
const completedRoundIds = new Set<number>();

/**
 * Resets in-flight and completed dedupe for tests. Production relies on a fresh module scope
 * or distinct `roundId` values from each `startGame`.
 */
export function __resetRoundResultPersistingForTests(): void {
  pendingRoundIds.clear();
  completedRoundIds.clear();
}

/**
 * Read modify write helper that merges one finished round into stored stats.
 *
 * WHY [module level dedupe]: the shell's `onFinish` can be invoked again when React 18 dev
 * StrictMode remounts, but `roundId` from the store and `pendingRoundIds` / `completedRoundIds`
 * stop duplicate RMWs even when the second `Date.now()`-style key would differ.
 */
export function useRecordRoundResult() {
  return useCallback(
    async (result: RoundResult): Promise<RecordRoundPersistOutcome | undefined> => {
      if (result.roundId === 0) {
        return undefined;
      }
      if (completedRoundIds.has(result.roundId)) {
        return undefined;
      }
      if (pendingRoundIds.has(result.roundId)) {
        return undefined;
      }
      pendingRoundIds.add(result.roundId);
      try {
        const current = await readMinigameStats();
        const previousHighScore = current.modes[result.mode].highScore;
        const isNewHighScore = isNewHighScoreForRound(current, result);
        const next = applyRoundResultToStats(current, result);
        await writeMinigameStats(next);
        completedRoundIds.add(result.roundId);
        return { isNewHighScore, previousHighScore };
      } catch {
        /* swallow: a failed stats write must not break the launcher UX */
        return undefined;
      } finally {
        pendingRoundIds.delete(result.roundId);
      }
    },
    []
  );
}
