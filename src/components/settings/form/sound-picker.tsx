import { useState, useCallback, useEffect, useRef } from 'react';
import type { NotificationSound } from '../../../../extension/common/types';
import {
  SOUND_DEFINITIONS,
  isPlayableSound,
  type SoundDefinition,
} from '../../../../extension/common/sound-config';
import { SoundPreviewButton } from './sound-preview-button';

interface SoundPickerProps {
  /** Currently selected sound */
  value: NotificationSound;
  /** Called when user confirms selection */
  onChange: (sound: NotificationSound) => void;
  /** Called when modal should close */
  onClose: () => void;
  /** Whether the modal is open */
  isOpen: boolean;
}

interface SoundOptionProps {
  definition: SoundDefinition;
  isSelected: boolean;
  onSelect: () => void;
}

/**
 * Check icon for selected state
 */
function CheckIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

/**
 * Sound wave visualization icon
 */
function WaveIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M2 10v4" />
      <path d="M6 8v8" />
      <path d="M10 6v12" />
      <path d="M14 8v8" />
      <path d="M18 10v4" />
      <path d="M22 12v0" />
    </svg>
  );
}

/**
 * Bell icon for bell sound type
 */
function BellIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

/**
 * Mute/off icon for disabled sound
 */
function MuteIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M11 5L6 9H2v6h4l5 4V5z" />
      <path d="M22 9l-6 6" />
      <path d="M16 9l6 6" />
    </svg>
  );
}

/**
 * Get the appropriate icon component for a sound type
 */
function SoundTypeIcon({
  icon,
  color,
  className = 'size-5',
}: {
  icon: SoundDefinition['icon'];
  color: SoundDefinition['color'];
  className?: string;
}) {
  const colorClass =
    {
      primary: 'text-primary',
      secondary: 'text-secondary',
      neutral: 'text-neutral',
    }[color] || 'text-base-content';

  const iconClass = `${className} ${colorClass}`;

  switch (icon) {
    case 'wave':
      return <WaveIcon className={iconClass} />;
    case 'bell':
      return <BellIcon className={iconClass} />;
    case 'mute':
      return <MuteIcon className={iconClass} />;
    default:
      return <WaveIcon className={iconClass} />;
  }
}

/**
 * Individual sound option row
 */
function SoundOption({ definition, isSelected, onSelect }: SoundOptionProps) {
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
      {/* Sound type icon */}
      <div
        className={`shrink-0 p-2 rounded-md pointer-events-none ${
          definition.color === 'primary'
            ? 'bg-primary/10'
            : definition.color === 'secondary'
              ? 'bg-secondary/10'
              : 'bg-neutral/10'
        }`}
      >
        <SoundTypeIcon icon={definition.icon} color={definition.color} className="size-5" />
      </div>

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
}

/**
 * SoundPicker modal component.
 * Displays available notification sounds with preview capability.
 */
export function SoundPicker({ value, onChange, onClose, isOpen }: SoundPickerProps) {
  const [selectedSound, setSelectedSound] = useState<NotificationSound>(value);
  const modalRef = useRef<HTMLDialogElement>(null);

  // Sync with external value when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedSound(value);
    }
  }, [isOpen, value]);

  // Handle modal open/close
  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;

    if (isOpen) {
      modal.showModal();
    } else {
      modal.close();
    }
  }, [isOpen]);

  /**
   * Handle sound selection
   */
  const handleSelect = useCallback(
    (soundId: NotificationSound) => {
      setSelectedSound(soundId);
    },
    [setSelectedSound]
  );

  /**
   * Confirm selection and close
   */
  const handleConfirm = useCallback(() => {
    onChange(selectedSound);
    onClose();
  }, [selectedSound, onChange, onClose]);

  /**
   * Handle modal backdrop click
   */
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target === modalRef.current) {
        onClose();
      }
    },
    [onClose]
  );

  /**
   * Handle keyboard escape
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDialogElement>) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  return (
    <dialog
      ref={modalRef}
      className="modal"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div className="modal-box max-w-sm p-0 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-base-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-base-content">Notification Sound</h3>
              <p className="text-xs text-base-content/60 mt-0.5">
                Preview and select your notification sound
              </p>
            </div>
          </div>
        </div>

        {/* Sound options list */}
        <div className="p-3 space-y-2 max-h-72 overflow-y-auto scrollbar-hide">
          {SOUND_DEFINITIONS.map((definition) => (
            <SoundOption
              key={definition.id}
              definition={definition}
              isSelected={selectedSound === definition.id}
              onSelect={() => handleSelect(definition.id)}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-base-200 bg-base-100 flex justify-end gap-2">
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
}
