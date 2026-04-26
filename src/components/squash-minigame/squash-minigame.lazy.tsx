import { lazy } from 'react';

/**
 * Lazy entry for the minigame. Phase 5 launchers import from here so the game store, loop, and
 * board chunks stay out of the popup's critical path. The minigame is hidden behind an Easter egg
 * and runs only after 42 popup opens, so deferring its bundle has no UX cost.
 */
export const SquashMinigameLazy = lazy(() =>
  import('./squash-minigame-shell').then((mod) => ({ default: mod.SquashMinigame }))
);

export type { SquashMinigameProps } from './squash-minigame-shell';
