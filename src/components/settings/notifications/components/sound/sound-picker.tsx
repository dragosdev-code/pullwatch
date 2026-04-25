import { useState, useCallback, useEffect, useRef } from 'react';
import type { CustomSoundId, NotificationSound } from '@common/types';
import { SOUND_DEFINITIONS } from '@common/sound-config';
import { useCustomSounds } from '@src/hooks/use-custom-sounds';
import { chromeExtensionService } from '@common/chrome-extension-service';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import { SoundOption } from './sound-option';
import { CustomSoundOptionRow } from './custom-sound-option-row';
import type { SoundPickerProps } from './sound-picker.types';

export type { SoundPickerProps } from './sound-picker.types';

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
  const [pendingDeleteId, setPendingDeleteId] = useState<CustomSoundId | null>(null);
  const [previewInterruptByCustomId, setPreviewInterruptByCustomId] = useState<
    Partial<Record<CustomSoundId, number>>
  >({});
  const modalRef = useRef<HTMLDialogElement>(null);
  const { customSounds, deleteCustomSound, getCustomSoundDefinition } = useCustomSounds();

  useEffect(() => {
    if (isOpen) {
      setSelectedSound(value);
      setPendingDeleteId(null);
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

  const handleSelect = useCallback((soundId: NotificationSound) => {
    setPendingDeleteId(null);
    setSelectedSound(soundId);
  }, []);

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

  const stopPreviewForCustomRow = useCallback((id: CustomSoundId) => {
    void chromeExtensionService.stopSoundPreview();
    setPreviewInterruptByCustomId((prev) => ({
      ...prev,
      [id]: (prev[id] ?? 0) + 1,
    }));
  }, []);

  const handleRequestDeleteCustom = useCallback(
    (e: React.MouseEvent, id: CustomSoundId) => {
      e.stopPropagation();
      stopPreviewForCustomRow(id);
      setPendingDeleteId(id);
    },
    [stopPreviewForCustomRow]
  );

  const handleCancelDeleteCustom = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDeleteId(null);
  }, []);

  const handleConfirmDeleteCustom = useCallback(
    async (e: React.MouseEvent, id: CustomSoundId) => {
      e.stopPropagation();
      stopPreviewForCustomRow(id);
      await deleteCustomSound(id);
      if (selectedSound === id) {
        setSelectedSound('ping');
      }
      setPendingDeleteId(null);
    },
    [deleteCustomSound, selectedSound, stopPreviewForCustomRow]
  );

  return (
    <dialog
      ref={modalRef}
      className="modal"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div className="modal-box w-full max-h-[min(100vh,32rem)] p-0 overflow-hidden flex flex-col">
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

        <div className="p-4 space-y-2 flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-hide">
          {SOUND_DEFINITIONS.filter((d) => d.id !== 'off').map((definition) => (
            <SoundOption
              key={definition.id}
              definition={definition}
              isSelected={selectedSound === definition.id}
              onSelect={() => handleSelect(definition.id)}
            />
          ))}

          {customSounds.length > 0 && (
            <>
              <div className="divider text-xs text-base-content/40 my-1">Your sounds</div>
              {customSounds.map((meta) => {
                const def = getCustomSoundDefinition(meta.id);
                if (!def) return null;
                return (
                  <CustomSoundOptionRow
                    key={meta.id}
                    meta={meta}
                    definition={def}
                    isSelected={selectedSound === meta.id}
                    isConfirming={pendingDeleteId === meta.id}
                    onSelect={() => handleSelect(meta.id)}
                    onRequestDelete={(e) => handleRequestDeleteCustom(e, meta.id)}
                    onConfirmDelete={(e) => handleConfirmDeleteCustom(e, meta.id)}
                    onCancelDelete={handleCancelDeleteCustom}
                    previewPlaybackInterruptKey={previewInterruptByCustomId[meta.id] ?? 0}
                  />
                );
              })}
            </>
          )}

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
            <ChevronRightIcon className="size-4 text-base-content/40 shrink-0" strokeWidth={2} />
          </div>
        </div>

        <div className="px-5 py-3 border-t border-base-200 bg-base-100 flex justify-end gap-2 shrink-0">
          <button type="button" onClick={onClose} className="btn btn-sm btn-ghost">
            Cancel
          </button>
          <button type="button" onClick={handleConfirm} className="btn btn-sm btn-primary">
            Select Sound
          </button>
        </div>
      </div>

      <form method="dialog" className="modal-backdrop">
        <button onClick={onClose}>close</button>
      </form>
    </dialog>
  );
};
