import { memo, useCallback } from 'react';
import { useStore } from 'zustand';
import clsx from 'clsx';
import { useGameStore } from '../context/game-store-context';
import type { Target } from '../game-types';

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
 * Single grid cell. Subscribes only to its own slot in `activeTargets` so siblings do not
 * re render on every spawn or click. `useStore(store, selector)` uses Object.is by default,
 * which matches the store's immutable replacement strategy (`activeTargets.slice()` on writes).
 */
function CellInner({ index }: CellProps) {
  const store = useGameStore();
  const target = useStore(store, (s) => s.activeTargets[index] ?? null);

  const handleClick = useCallback(() => {
    store.getState().clickCell(index, performance.now());
  }, [store, index]);

  const isBug = target?.kind === 'bug';
  const isCracked = isBug && target.damageStage > 0;
  const isFeature = target?.kind === 'feature';

  return (
    <button
      type="button"
      data-testid={`squash-cell-${index}`}
      data-target-kind={target?.kind ?? 'empty'}
      data-target-damage={target?.damageStage ?? 0}
      aria-label={`grid cell ${index} ${getCellLabel(target)}`.trim()}
      onClick={handleClick}
      className={clsx(
        'relative flex aspect-square select-none items-center justify-center rounded-md border border-base-300 text-xs font-semibold uppercase tracking-wide transition',
        target === null && 'bg-base-200 text-base-content/40',
        isBug && !isCracked && 'bg-warning text-warning-content',
        isCracked && 'bg-warning/60 text-warning-content',
        isFeature && 'bg-error text-error-content'
      )}
    >
      <span aria-hidden>{getCellGlyph(target)}</span>
    </button>
  );
}

export const Cell = memo(CellInner);
