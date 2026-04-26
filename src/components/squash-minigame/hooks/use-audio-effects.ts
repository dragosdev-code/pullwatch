import { useEffect, useRef } from 'react';
import { useGameStore } from '../context/game-store-context';
import { createAudioEngine, type AudioEngine, type AudioEngineDeps } from '../audio/audio-engine';

export interface UseAudioEffectsOptions {
  /** Test seam: pass a stub engine to avoid touching AudioContext. */
  engine?: AudioEngine;
  engineDeps?: AudioEngineDeps;
}

/**
 * Subscribes to `lastClick` and pipes each new outcome into the audio engine, passing the combo
 * value at click time so the bug pop pitches up with longer streaks. Engine is created lazily
 * inside a ref so React renders do not churn the AudioContext.
 */
export function useAudioEffects(options: UseAudioEffectsOptions = {}) {
  const store = useGameStore();
  const engineRef = useRef<AudioEngine | null>(null);

  if (!engineRef.current) {
    engineRef.current = options.engine ?? createAudioEngine(options.engineDeps);
  }

  useEffect(() => {
    let lastAt = store.getState().lastClick?.at ?? -1;
    const unsubscribe = store.subscribe((state) => {
      const click = state.lastClick;
      if (!click || click.at === lastAt) return;
      lastAt = click.at;
      const combo = click.outcome.kind === 'bug_squashed' ? click.outcome.combo : state.combo;
      engineRef.current?.playOutcome(click.outcome, combo);
    });
    return () => {
      unsubscribe();
      engineRef.current?.close();
      engineRef.current = null;
    };
  }, [store]);
}
