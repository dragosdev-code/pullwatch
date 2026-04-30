import { useEffect } from 'react';
import { useGameStore } from '../context/game-store-context';
import type { AudioEngine, AudioEngineDeps } from '../audio/audio-engine';

/**
 * Configuration shape consumed by `SquashMinigameBody` to construct the shared {@link AudioEngine}
 * (one per minigame session, shared between click and round-end audio). Tests can inject a stub
 * engine to avoid touching `AudioContext`.
 */
export interface UseAudioEffectsOptions {
  engine?: AudioEngine;
  engineDeps?: AudioEngineDeps;
}

/**
 * Subscribes to `lastClick` and pipes each new outcome into the audio engine, passing the combo
 * value at click time so the bug pop pitches up with longer streaks.
 *
 * WHY [hook does not own engine lifecycle]: the engine is shared with `useRoundEndAudio` and
 * created/disposed by `SquashMinigameBody`. Closing it from this hook's cleanup (which fires on
 * `[store]` dependency change AND on React StrictMode's mount → cleanup → mount cycle) silently
 * killed the AudioContext after the first click in dev and after every "Try Again" in prod —
 * the next play attempt landed on a closed engine. Passing the engine in keeps lifecycle in one
 * place; this hook only subscribes/unsubscribes.
 */
export function useAudioEffects(engine: AudioEngine | null) {
  const store = useGameStore();

  useEffect(() => {
    if (!engine) return;
    let lastClickId = store.getState().lastClick?.id ?? -1;
    const unsubscribe = store.subscribe((state) => {
      const click = state.lastClick;
      if (!click || click.id === lastClickId) return;
      lastClickId = click.id;
      const combo = click.outcome.kind === 'bug_squashed' ? click.outcome.combo : state.combo;
      engine.playOutcome(click.outcome, combo);
    });
    return unsubscribe;
  }, [store, engine]);
}
