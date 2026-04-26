import { useEffect, useRef } from 'react';
import { useGameStore } from '../context/game-store-context';
import type { AudioEngine } from '../audio/audio-engine';

/**
 * Plays a one-shot round-end cue when the store transitions from `playing` to `finished`.
 *
 * WHY [dedup by roundId]: React StrictMode double-mounts effects. By tracking the last
 * `roundId` that triggered playback, we guarantee the cue fires exactly once per round
 * regardless of mount count.
 */
export function useRoundEndAudio(engine: AudioEngine | null) {
  const store = useGameStore();
  const lastPlayedRoundIdRef = useRef<number>(-1);
  const prevStatusRef = useRef<string>('idle');

  useEffect(() => {
    const initialState = store.getState();
    prevStatusRef.current = initialState.status;

    const unsubscribe = store.subscribe((state) => {
      const prevStatus = prevStatusRef.current;
      prevStatusRef.current = state.status;

      if (
        prevStatus === 'playing' &&
        state.status === 'finished' &&
        state.roundId !== lastPlayedRoundIdRef.current
      ) {
        lastPlayedRoundIdRef.current = state.roundId;
        engine?.playRoundEnd();
      }
    });
    return unsubscribe;
  }, [store, engine]);
}
