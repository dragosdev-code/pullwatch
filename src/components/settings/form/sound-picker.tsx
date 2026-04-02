import { useState, useCallback, useEffect, useRef } from 'react';
import type { NotificationSound } from '../../../../extension/common/types';
import {
  SOUND_DEFINITIONS,
  isPlayableSound,
  isCustomSoundId,
  type SoundDefinition,
} from '../../../../extension/common/sound-config';
import { useCustomSounds } from '../../../hooks/use-custom-sounds';
import { SoundPreviewButton } from './sound-preview-button';
import { CheckIcon, XIcon } from '../../ui/icons';

interface SoundPickerProps {
  /** Currently selected sound */
  value: NotificationSound;
  /** Called when user confirms selection */
  onChange: (sound: NotificationSound) => void;
  /** Called when modal should close */
  onClose: () => void;
  /** Whether the modal is open */
  isOpen: boolean;
  /** Called when user clicks the "Custom" row to open the editor */
  onOpenCustomEditor?: () => void;
}

interface SoundOptionProps {
  definition: SoundDefinition;
  isSelected: boolean;
  onSelect: () => void;
}

/**
 * Individual sound option row
 */
const SoundOption = ({ definition, isSelected, onSelect }: SoundOptionProps) => {
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
      {/* Sound info */}
      <div className="flex-1 min-w-0 pointer-events-none">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-base-content">{definition.name}</span>
          {isSelected && <CheckIcon className="size-3.5 text-primary" />}
        </div>
        <p className="text-xs text-base-content/60 truncate">{definition.description}</p>
      </div>

      {/* Play button (only for playable sounds) */}
      {isPlayable ? (
        <div onClick={(e) => e.stopPropagation()} className="shrink-0">
          <SoundPreviewButton sound={definition.id} disabled={false} size="sm" />
        </div>
      ) : (
        <div className="shrink-0 w-10" /> // Spacer for alignment
      )}
    </div>
  );
};

/**
 * SoundPicker modal component.
 * Displays built-in and custom notification sounds with preview capability.
 */
export const SoundPicker = ({
  value,
  onChange,
  onClose,
  isOpen,
  onOpenCustomEditor,
}: SoundPickerProps) => {
  const [selectedSound, setSelectedSound] = useState<NotificationSound>(value);
  const modalRef = useRef<HTMLDialogElement>(null);
  const { customSounds, deleteCustomSound, getCustomSoundDefinition } = useCustomSounds();

  useEffect(() => {
    if (isOpen) {
      setSelectedSound(value);
    }
  }, [isOpen, value]);

  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;
    if (isOpen) {
      modal.showModal();
    } else {
      modal.close();
    }
  }, [isOpen]);

  const handleSelect = useCallback(
    (soundId: NotificationSound) => {
      setSelectedSound(soundId);
    },
    [setSelectedSound]
  );

  const handleConfirm = useCallback(() => {
    onChange(selectedSound);
    onClose();
  }, [selectedSound, onChange, onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target === modalRef.current) {
        onClose();
      }
    },
    [onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDialogElement>) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  const handleOpenEditor = useCallback(() => {
    onOpenCustomEditor?.();
  }, [onOpenCustomEditor]);

  const handleDeleteCustom = useCallback(
    (e: React.MouseEvent, id: NotificationSound) => {
      e.stopPropagation();
      if (isCustomSoundId(id)) {
        deleteCustomSound(id);
        if (selectedSound === id) {
          setSelectedSound('ping');
        }
      }
    },
    [deleteCustomSound, selectedSound]
  );

  return (
    <dialog
      ref={modalRef}
      className="modal"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div className="modal-box max-w-md max-h-[min(100vh,32rem)] p-0 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-base-200 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-base-content">Notification Sound</h3>
              <p className="text-xs text-base-content/60 mt-0.5">
                Preview and select your notification sound
              </p>
            </div>
          </div>
        </div>

        {/* Sound options list — scrolls; footer stays visible (matches CustomSoundEditor) */}
        <div className="p-4 space-y-2 flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-hide">
          {/* Built-in sounds */}
          {SOUND_DEFINITIONS.filter((d) => d.id !== 'off').map((definition) => (
            <SoundOption
              key={definition.id}
              definition={definition}
              isSelected={selectedSound === definition.id}
              onSelect={() => handleSelect(definition.id)}
            />
          ))}

          {/* Custom sounds */}
          {customSounds.length > 0 && (
            <>
              <div className="divider text-xs text-base-content/40 my-1">Your sounds</div>
              {customSounds.map((meta) => {
                const def = getCustomSoundDefinition(meta.id);
                if (!def) return null;
                return (
                  <div key={meta.id} className="relative">
                    <SoundOption
                      definition={def}
                      isSelected={selectedSound === meta.id}
                      onSelect={() => handleSelect(meta.id)}
                    />
                    <button
                      type="button"
                      onClick={(e) => handleDeleteCustom(e, meta.id)}
                      className="absolute top-1.5 right-1.5 btn btn-ghost btn-xs btn-circle text-base-content/30 hover:text-error hover:bg-error/10 z-10"
                      aria-label={`Delete ${meta.name}`}
                    >
                      <XIcon className="size-2.5" width={10} height={10} />
                    </button>
                  </div>
                );
              })}
            </>
          )}

          {/* Custom gateway row */}
          <div
            role="button"
            tabIndex={0}
            onClick={handleOpenEditor}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleOpenEditor();
              }
            }}
            className="flex items-center gap-3 p-3 rounded-lg border border-dashed border-base-300
                       hover:border-primary/40 hover:bg-primary/5 transition-all duration-200 cursor-pointer"
          >
            <div className="flex-1 min-w-0">
              <span className="font-medium text-sm text-base-content">Custom</span>
              <p className="text-xs text-base-content/60">Upload and trim your own sounds</p>
            </div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4 text-base-content/40 shrink-0"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-base-200 bg-base-100 flex justify-end gap-2 shrink-0">
          <button type="button" onClick={onClose} className="btn btn-sm btn-ghost">
            Cancel
          </button>
          <button type="button" onClick={handleConfirm} className="btn btn-sm btn-primary">
            Select Sound
          </button>
        </div>
      </div>

      {/* Backdrop */}
      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>
    </dialog>
  );
};
