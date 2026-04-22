import type { ReactNode } from 'react';
import { CheckIcon } from '@heroicons/react/24/outline';
import { isPlayableSound, type SoundDefinition } from '../../../../../../extension/common/sound-config';
import { SoundPreviewButton } from '../../../../audio';

export interface SoundOptionProps {
  definition: SoundDefinition;
  isSelected: boolean;
  onSelect: () => void;
  /** Rendered after the preview control; custom rows use this for delete (built-ins omit it). */
  trailingActions?: ReactNode;
  /** Bumped when parent stops preview externally so the play control resets. */
  previewPlaybackInterruptKey?: number;
}

/**
 * Individual sound option row
 */
export const SoundOption = ({
  definition,
  isSelected,
  onSelect,
  trailingActions,
  previewPlaybackInterruptKey,
}: SoundOptionProps) => {
  const isPlayable = isPlayableSound(definition.id);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`flex items-center gap-3 p-3 rounded-lg border transition-all duration-200 cursor-pointer ${
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-base-200 hover:border-base-300 hover:bg-base-100'
      }`}
      aria-label={`Select ${definition.name}`}
    >
      <div className="flex-1 min-w-0 pointer-events-none">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-base-content">{definition.name}</span>
          {isSelected && <CheckIcon className="size-3.5 text-primary" strokeWidth={2.5} />}
        </div>
        <p className="text-xs text-base-content/60 truncate">{definition.description}</p>
      </div>

      {isPlayable ? (
        <div onClick={(e) => e.stopPropagation()} className="shrink-0 flex items-center gap-1">
          <SoundPreviewButton
            sound={definition.id}
            disabled={false}
            size="sm"
            playbackInterruptKey={previewPlaybackInterruptKey}
          />
          {trailingActions}
        </div>
      ) : (
        <div className="shrink-0 w-10" aria-hidden />
      )}
    </div>
  );
};
