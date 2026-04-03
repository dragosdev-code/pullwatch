import type { CustomSoundId, CustomSoundMeta } from '../../../extension/common/types';

// ---------------------------------------------------------------------------
// Drag / interaction types
// ---------------------------------------------------------------------------

/** Which trim control the user is interacting with. */
export type DragMode = 'start' | 'end' | 'move';

/** Currently hovered trim zone, or null when pointer is outside all zones. */
export type HoverZone = DragMode | null;

/**
 * Snapshot of state captured on pointerdown to compute drag deltas.
 *
 * WHY we snapshot instead of reading live state: during a drag the user
 * moves relative to their starting position. If we read `startS`/`endS`
 * from React state each frame, accumulated floating-point drift and
 * state-batching delays would make the drag feel laggy and imprecise.
 */
export interface DragState {
  mode: DragMode;
  /** Time (seconds) at the pointer-down position. */
  t0: number;
  /** startS at the moment the drag began. */
  s0: number;
  /** endS at the moment the drag began. */
  e0: number;
  /** Audio duration at the moment the drag began. */
  dur: number;
}

/** Direction for edge-auto-scroll. */
export type EdgeScrollDir = 'left' | 'right';

// ---------------------------------------------------------------------------
// Component prop types
// ---------------------------------------------------------------------------

export interface WaveformScrollerProps {
  peaks: number[];
  startS: number;
  endS: number;
  duration: number;
  setStartS: (v: number) => void;
  setEndS: (v: number) => void;
}

export interface SavedSoundRowProps {
  meta: CustomSoundMeta;
  isConfirming: boolean;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}

export interface CustomSoundEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (id: CustomSoundId) => void;
}

/** react-hook-form shape for the custom sound name field in the editor modal. */
export type SoundNameForm = { soundName: string };
