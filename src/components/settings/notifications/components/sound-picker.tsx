import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { animated, useTransition } from '@react-spring/web';
import type {
  CustomSoundId,
  CustomSoundMeta,
  NotificationSound,
} from '../../../../../extension/common/types';
import {
  SOUND_DEFINITIONS,
  isPlayableSound,
  type SoundDefinition,
} from '../../../../../extension/common/sound-config';
import { useCustomSounds } from '../../../../hooks/use-custom-sounds';
import { chromeExtensionService } from '../../../../services/chrome-extension-service';
import { SoundPreviewButton } from '../../../audio';
import { CheckIcon, XMarkIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { usePrefersReducedMotion } from '../../../../hooks/use-prefers-reduced-motion';
import { SETTINGS_SPRING_SOFT } from '../../shared/animation/settings-motion';

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
  /** Rendered after the preview control; custom rows use this for delete (built-ins omit it). */
  trailingActions?: ReactNode;
  /** Bumped when parent stops preview externally so the play control resets. */
  previewPlaybackInterruptKey?: number;
}

/**
 * Individual sound option row
 */
const SoundOption = ({
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
      {/* Sound info */}
      <div className="flex-1 min-w-0 pointer-events-none">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-base-content">{definition.name}</span>
          {isSelected && <CheckIcon className="size-3.5 text-primary" strokeWidth={2.5} />}
        </div>
        <p className="text-xs text-base-content/60 truncate">{definition.description}</p>
      </div>

      {/* Preview + optional trailing actions (delete sits here for custom sounds only) */}
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

interface CustomSoundOptionRowProps {
  meta: CustomSoundMeta;
  definition: SoundDefinition;
  isSelected: boolean;
  /** When true, row shows confirm/cancel like CustomSoundEditor saved list (taller padding than editor). */
  isConfirming: boolean;
  onSelect: () => void;
  onRequestDelete: (e: React.MouseEvent) => void;
  onConfirmDelete: (e: React.MouseEvent) => void;
  onCancelDelete: (e: React.MouseEvent) => void;
  previewPlaybackInterruptKey?: number;
}

interface ConfirmDeleteRowProps {
  name: string;
  onConfirm: (e: React.MouseEvent) => void;
  onCancel: (e: React.MouseEvent) => void;
}

/**
 * Confirm panel — structurally mirrors [SoundOption] (same `p-3`, same two-line text area,
 * same trailing button column sizing) so the card-flip between the two states has identical
 * dimensions and the list below does not shift.
 */
const ConfirmDeleteRow = ({ name, onConfirm, onCancel }: ConfirmDeleteRowProps) => (
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

/**
 * Custom sound row with a crossfade between the normal row and the delete-confirm panel.
 *
 * Layout: CSS grid with a single named area so the normal row and the confirm row render
 * into the same cell. Both children exist in the DOM simultaneously during the swap — which
 * keeps the list's vertical rhythm stable while the outgoing side fades and the incoming side
 * fades in with a slight vertical settle. The grid auto-sizes to the taller child, but both
 * children share the exact same markup skeleton so the height stays constant.
 */
const CustomSoundOptionRow = ({
  meta,
  definition,
  isSelected,
  isConfirming,
  onSelect,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
  previewPlaybackInterruptKey,
}: CustomSoundOptionRowProps) => {
  const prefersReducedMotion = usePrefersReducedMotion();

  const transitions = useTransition(isConfirming, {
    from: { opacity: 0, y: 6 },
    enter: { opacity: 1, y: 0 },
    leave: { opacity: 0, y: 0 },
    config: SETTINGS_SPRING_SOFT,
    immediate: prefersReducedMotion,
  });

  return (
    <div className="grid" style={{ gridTemplateAreas: '"card"' }}>
      {transitions((style, confirming) => (
        <animated.div
          style={{
            gridArea: 'card',
            opacity: style.opacity,
            transform: style.y.to((y) => `translateY(${y}px)`),
          }}
        >
          {confirming ? (
            <ConfirmDeleteRow
              name={meta.name}
              onConfirm={onConfirmDelete}
              onCancel={onCancelDelete}
            />
          ) : (
            <SoundOption
              definition={definition}
              isSelected={isSelected}
              onSelect={onSelect}
              previewPlaybackInterruptKey={previewPlaybackInterruptKey}
              trailingActions={
                <button
                  type="button"
                  onClick={onRequestDelete}
                  className="btn btn-ghost btn-xs btn-circle text-base-content/30 hover:text-error hover:bg-error/10"
                  aria-label={`Delete ${meta.name}`}
                >
                  <XMarkIcon className="size-2.5" strokeWidth={2} />
                </button>
              }
            />
          )}
        </animated.div>
      ))}
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
            <ChevronRightIcon className="size-4 text-base-content/40 shrink-0" strokeWidth={2} />
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
