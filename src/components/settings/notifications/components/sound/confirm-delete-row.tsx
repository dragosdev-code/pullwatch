import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';

export interface ConfirmDeleteRowProps {
  name: string;
  onConfirm: (e: React.MouseEvent) => void;
  onCancel: (e: React.MouseEvent) => void;
}

/**
 * Confirm panel — structurally mirrors [SoundOption] (same `p-3`, same two-line text area,
 * same trailing button column sizing) so the card-flip between the two states has identical
 * dimensions and the list below does not shift.
 */
export const ConfirmDeleteRow = ({ name, onConfirm, onCancel }: ConfirmDeleteRowProps) => (
  <div
    className="flex items-center gap-3 p-3 rounded-lg border border-base-300 bg-base-200/80"
    onClick={(e) => e.stopPropagation()}
    role="group"
    aria-label={`Confirm deleting ${name}`}
  >
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2">
        <span className="font-medium text-sm text-base-content truncate">
          Remove &ldquo;{name}&rdquo;?
        </span>
      </div>
      <p className="text-xs text-base-content/60">This cannot be undone.</p>
    </div>
    <div className="shrink-0 flex items-center gap-1">
      <button
        type="button"
        onClick={onConfirm}
        className="btn btn-ghost btn-sm btn-circle min-h-0 h-7 w-7 text-success hover:bg-success/15"
        aria-label="Confirm delete"
      >
        <CheckIcon className="size-4" strokeWidth={2.5} />
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="btn btn-ghost btn-sm btn-circle min-h-0 h-7 w-7 text-base-content/50 hover:text-base-content hover:bg-base-300/50"
        aria-label="Cancel delete"
      >
        <XMarkIcon className="size-3.5" strokeWidth={2} />
      </button>
    </div>
  </div>
);
