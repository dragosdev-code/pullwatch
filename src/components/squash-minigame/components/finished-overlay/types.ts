import type { FinishCelebration, GameMode } from '../../game-types';

export interface FinishedOverlayProps {
  /** Current round mode (default selection in picker; same as committed choice triggers replay). */
  mode: GameMode;
  onTryAgain: () => void;
  /** When set, user can open the mode grid and switch without leaving the shell. */
  onChangeMode?: (mode: GameMode) => void;
  onExit?: () => void;
  /** Parent sets when persist reports a new per-mode high for this session `roundId`. */
  finishCelebration?: FinishCelebration | null;
}
