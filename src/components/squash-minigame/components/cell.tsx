import { memo, useCallback } from 'react';
import { useStore } from 'zustand';
import clsx from 'clsx';
import { useGameStore } from '../context/game-store-context';
import { computeBugPhase } from '../game-phase';
import type { BugPhase, Target } from '../game-types';

export interface CellProps {
  index: number;
}

function getCellLabel(target: Target | null): string {
  if (target === null) return '';
  if (target.kind === 'feature') return 'feature';
  if (target.damageStage > 0) return 'cracked bug';
  return 'bug';
}

function getCellGlyph(target: Target | null): string {
  if (target === null) return '';
  if (target.kind === 'feature') return 'feat';
  return 'bug';
}

/**
 * Map a bug's lifetime phase to a DaisyUI `bg-warning` opacity tier.
 *
 * WHY [three tiers]: the phase is a visual cue that aligns with the scoring system —
 * fresh (10pt) is brightest, final (2pt) is dimmest, nudging the player to click sooner.
 */
const PHASE_BG: Record<BugPhase, string> = {
  fresh: 'bg-warning',
  middle: 'bg-warning/65',
  final: 'bg-warning/35',
};

/**
 * Single grid cell. Subscribes only to its own slot in `activeTargets` so siblings do not
 * re render on every spawn or click. `useStore(store, selector)` uses Object.is by default,
 * which matches the store's immutable replacement strategy (`activeTargets.slice()` on writes).
 */
function CellInner({ index }: CellProps) {
  const store = useGameStore();
  const target = useStore(store, (s) => s.activeTargets[index] ?? null);
  const targetLifetimeMs = useStore(store, (s) => s.config.targetLifetimeMs);

  const handleClick = useCallback(() => {
    store.getState().clickCell(index, performance.now());
  }, [store, index]);

  const isBug = target?.kind === 'bug';
  const isCracked = isBug && target.damageStage > 0;
  const isFeature = target?.kind === 'feature';

  /**
   * WHY [derive phase at render, not store]: phase depends on `performance.now()` which changes
   * every frame. Storing it on Target would require the tick loop to update every target every
   * frame, breaking the immutable-slot optimization. Instead, we derive it here — React only
   * re-renders this cell when the target reference changes (spawn, crack, despawn).
   */
  const phase: BugPhase | null = isBug
    ? computeBugPhase(target, performance.now(), targetLifetimeMs)
    : null;

  return (
    <button
      type="button"
      data-testid={`squash-cell-${index}`}
      data-target-kind={target?.kind ?? 'empty'}
      data-target-damage={target?.damageStage ?? 0}
      data-target-phase={phase ?? 'none'}
      aria-label={`grid cell ${index} ${getCellLabel(target)}`.trim()}
      onClick={handleClick}
      className={clsx(
        'relative flex aspect-square select-none items-center justify-center rounded-md border border-base-300 text-xs font-semibold uppercase tracking-wide transition',
        target === null && 'bg-base-200 text-base-content/40',
        isBug && !isCracked && phase && `${PHASE_BG[phase]} text-warning-content`,
        isCracked && phase && `${PHASE_BG[phase]} text-warning-content ring-1 ring-warning-content/30`,
        isFeature && 'bg-error text-error-content'
      )}
    >
      <span aria-hidden>{getCellGlyph(target)}</span>
    </button>
  );
}

export const Cell = memo(CellInner);
