import { memo } from 'react';
import { useStore } from 'zustand';
import clsx from 'clsx';
import { usePrefersReducedMotion } from '@src/hooks/use-prefers-reduced-motion';
import { useGameStore } from '../../context/game-store-context';
import { computeBugPhase } from '../../game-phase';
import type { BugPhase } from '../../game-types';
import { PHASE_BG, getCellGlyph, getCellLabel } from './cell-display';
import { useSquashCellActivation } from './hooks/use-squash-cell-activation';
import { SquashCellGlyph } from './squash-cell-glyph';
import type { CellProps } from './types';

/**
 * Single grid cell. Subscribes only to its own slot in `activeTargets` so siblings do not
 * re-render on every spawn or click. `useStore(store, selector)` uses Object.is by default,
 * which matches the store's immutable replacement strategy (`activeTargets.slice()` on writes).
 *
 * Interaction + tap feedback live in {@link useSquashCellActivation}.
 */
function SquashCellInner({ index }: CellProps) {
  const store = useGameStore();
  const target = useStore(store, (s) => s.activeTargets[index] ?? null);
  const targetLifetimeMs = useStore(store, (s) => s.config.targetLifetimeMs);
  const reducedMotion = usePrefersReducedMotion();

  const activation = useSquashCellActivation({
    store,
    cellIndex: index,
    reducedMotion,
  });

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
      ref={activation.buttonRef}
      type="button"
      data-testid={`squash-cell-${index}`}
      data-target-kind={target?.kind ?? 'empty'}
      data-target-damage={target?.damageStage ?? 0}
      data-target-phase={phase ?? 'none'}
      aria-label={`grid cell ${index} ${getCellLabel(target)}`.trim()}
      onPointerDown={activation.onPointerDown}
      onPointerUp={activation.onPointerUp}
      onPointerCancel={activation.onPointerCancel}
      onKeyDown={activation.onKeyDown}
      onClick={activation.onClick}
      className={clsx(
        'relative flex aspect-square transform-gpu touch-manipulation select-none items-center justify-center rounded-md border border-base-300 text-xs font-semibold uppercase tracking-wide transition-colors',
        target === null && 'bg-base-200 text-base-content/40',
        isBug && !isCracked && phase && `${PHASE_BG[phase]} text-warning-content`,
        isCracked && phase && `${PHASE_BG[phase]} text-warning-content ring-1 ring-warning-content/30`,
        isFeature && 'bg-error text-error-content'
      )}
    >
      <SquashCellGlyph ref={activation.glyphRef} glyphText={getCellGlyph(target)} />
    </button>
  );
}

export const SquashCell = memo(SquashCellInner);
