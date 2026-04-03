import type { SavedSoundRowProps } from '../types';
import { CheckIcon, XIcon } from '../../ui/icons';
import { SoundPreviewButton } from '../../settings/form/sound-preview-button';

export const SavedSoundRow = ({
  meta,
  isConfirming,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: SavedSoundRowProps) => {
  if (isConfirming) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg bg-base-200/80 border border-base-300">
        <span className="flex-1 text-xs text-base-content">Remove &ldquo;{meta.name}&rdquo;?</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onConfirmDelete();
          }}
          className="btn btn-ghost btn-xs btn-circle text-success hover:bg-success/15"
          aria-label="Confirm delete"
        >
          <CheckIcon className="size-3.5 text-success" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCancelDelete();
          }}
          className="btn btn-ghost btn-xs btn-circle text-base-content/50 hover:text-base-content hover:bg-base-300/50"
          aria-label="Cancel delete"
        >
          <XIcon className="size-3" width={12} height={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-base-100 border border-base-200">
      <span className="flex-1 text-sm font-medium text-base-content truncate">{meta.name}</span>
      <span className="badge badge-sm badge-ghost">{(meta.durationMs / 1000).toFixed(1)}s</span>
      <div onClick={(e) => e.stopPropagation()} className="shrink-0">
        <SoundPreviewButton sound={meta.id} size="sm" />
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRequestDelete();
        }}
        className="btn btn-ghost btn-xs btn-circle text-error/60 hover:text-error hover:bg-error/10 shrink-0"
        aria-label={`Delete ${meta.name}`}
      >
        <XIcon className="size-3" width={12} height={12} />
      </button>
    </div>
  );
};
