import { useStore } from 'zustand';
import { useGameStore } from '../context/game-store-context';
import { Cell } from './cell';

/**
 * Renders the bug grid. Subscribes only to `gridSize` so cell count changes (scope creep variant)
 * trigger a layout pass; per cell content updates are handled inside `Cell` via atomic selectors.
 */
export function GameBoard() {
  const store = useGameStore();
  const gridSize = useStore(store, (s) => s.gridSize);
  const cellCount = gridSize * gridSize;

  return (
    <div
      data-testid="squash-game-board"
      data-grid-size={gridSize}
      className="grid w-full gap-1"
      style={{ gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: cellCount }, (_, index) => (
        <Cell key={index} index={index} />
      ))}
    </div>
  );
}
