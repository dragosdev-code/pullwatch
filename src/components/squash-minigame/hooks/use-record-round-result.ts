import { useCallback, useRef } from 'react';
import { applyRoundResultToStats, type RoundResult } from '../storage/record-round-result';
import { readMinigameStats, writeMinigameStats } from '../storage/minigame-stats-storage';

/**
 * Read modify write helper that merges one finished round into stored stats.
 *
 * WHY [in flight guard]: the shell calls this from a `status === 'finished'` effect that fires
 * once on transition, but StrictMode can run the same effect twice in dev. The guard prevents a
 * double increment of `playCount` while still allowing real subsequent rounds to record.
 */
export function useRecordRoundResult() {
  const inFlightRef = useRef<string | null>(null);

  return useCallback(async (result: RoundResult, key?: string) => {
    const guardKey = key ?? `${result.mode}:${result.score}:${Date.now()}`;
    if (inFlightRef.current === guardKey) return;
    inFlightRef.current = guardKey;
    try {
      const current = await readMinigameStats();
      const next = applyRoundResultToStats(current, result);
      await writeMinigameStats(next);
    } catch {
      /* swallow: a failed stats write must not break the launcher UX */
    } finally {
      inFlightRef.current = null;
    }
  }, []);
}
