import { useEffect } from 'react';
import { useStore } from 'zustand';
import type { FinishedRoundSummary, GameMode } from '../game-types';
import { useGameStore } from '../context/game-store-context';

/** Survives React 18 dev StrictMode subtree remounts; paired with `store.roundId` from `startGame`. */
let lastNotifiedFinishRoundId: number | null = null;

/** Test only. */
export function __resetLastFinishNotificationForTests(): void {
  lastNotifiedFinishRoundId = null;
}

/**
 * Fires `onFinish` once per finished `roundId` (survives StrictMode remount). Captures summary
 * stats at the transition so a subsequent reset does not zero them before the launcher reads them.
 */
export function useFinishedReporter(
  mode: GameMode,
  onFinish: ((summary: FinishedRoundSummary) => void) | undefined
): void {
  const store = useGameStore();
  const status = useStore(store, (s) => s.status);

  useEffect(() => {
    if (status !== 'finished' || !onFinish) {
      return;
    }
    const s = store.getState();
    if (s.roundId === lastNotifiedFinishRoundId) {
      return;
    }
    lastNotifiedFinishRoundId = s.roundId;
    onFinish({
      mode,
      roundId: s.roundId,
      score: s.score,
      highestCombo: s.highestCombo,
      bugsSquashed: s.bugsSquashed,
      featuresBroken: s.featuresBroken,
      durationSeconds: Math.round(s.elapsedMs / 1000),
    });
  }, [status, store, mode, onFinish]);
}
