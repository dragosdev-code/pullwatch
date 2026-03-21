import { useState, useCallback } from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import type { ExtensionSettings } from '../types';
import type { NotificationSound } from '../../../../extension/common/types';
import { getSoundDefinition } from '../../../../extension/common/sound-config';
import { SoundPicker } from './sound-picker';
import { SoundPreviewButton } from './sound-preview-button';
import { MusicIcon } from '../../ui/icons';

interface SoundSelectFieldProps {
  name: string;
  label: string;
  disabled?: boolean;
}

/**
 * Enhanced sound selection field with modal picker and preview.
 * Replaces the native select dropdown with a rich modal-based picker.
 */
export const SoundSelectField = ({ name, label, disabled = false }: SoundSelectFieldProps) => {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const { control } = useFormContext<ExtensionSettings>();

  const openPicker = useCallback(() => {
    if (!disabled) {
      setIsPickerOpen(true);
    }
  }, [disabled]);

  const closePicker = useCallback(() => {
    setIsPickerOpen(false);
  }, []);

  return (
    <Controller
      name={name as 'assigned.sound' | 'merged.sound'}
      control={control}
      render={({ field: { value, onChange } }) => {
        const soundValue = value as NotificationSound;
        const soundDefinition = getSoundDefinition(soundValue);

        return (
          <div
            className={`flex items-center justify-between gap-3 transition-opacity duration-200 ${
              disabled ? 'opacity-40 pointer-events-none' : ''
            }`}
          >
            <span className="text-sm font-medium text-base-content">{label}</span>

            <div className="flex items-center gap-3">
              {/* Inline preview button */}
              <SoundPreviewButton sound={soundValue} disabled={disabled} size="sm" />

              {/* Current selection badge */}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary ring-1 ring-primary/20">
                <MusicIcon className="size-3" />
                {soundDefinition?.name || soundValue}
              </span>

              {/* Open picker button */}
              <button
                type="button"
                onClick={openPicker}
                disabled={disabled}
                className="btn btn-sm btn-ghost h-8 px-3 text-xs font-medium text-base-content/50 hover:text-base-content border border-base-300 hover:border-base-content/30"
                aria-label={`Current sound: ${soundDefinition?.name || soundValue}. Click to change.`}
              >
                Change
              </button>
            </div>

            {/* Sound picker modal */}
            <SoundPicker
              value={soundValue}
              onChange={onChange}
              isOpen={isPickerOpen}
              onClose={closePicker}
            />
          </div>
        );
      }}
    />
  );
};
