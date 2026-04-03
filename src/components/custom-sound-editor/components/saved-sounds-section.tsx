import type { CustomSoundId, CustomSoundMeta } from '../../../../extension/common/types';
import { SavedSoundRow } from './saved-sound-row';

interface SavedSoundsSectionProps {
  customSounds: CustomSoundMeta[];
  pendingDeleteId: CustomSoundId | null;
  onRequestDelete: (id: CustomSoundId) => void;
  onConfirmDelete: (id: CustomSoundId) => void;
  onCancelDelete: () => void;
}

export const SavedSoundsSection = ({
  customSounds,
  pendingDeleteId,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: SavedSoundsSectionProps) => (
  <>
    <div className="divider text-xs text-base-content/40 my-2">
      Saved sounds ({customSounds.length}/3)
    </div>
    <div className="space-y-1.5">
      {customSounds.map((s) => (
        <SavedSoundRow
          key={s.id}
          meta={s}
          isConfirming={pendingDeleteId === s.id}
          onRequestDelete={() => onRequestDelete(s.id)}
          onConfirmDelete={() => onConfirmDelete(s.id)}
          onCancelDelete={onCancelDelete}
        />
      ))}
    </div>
  </>
);
