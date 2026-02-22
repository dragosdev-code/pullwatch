import { useState, useCallback } from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import type { ExtensionSettings } from '../types';
import type { NotificationSound } from '../../../../extension/common/types';
import { getSoundDefinition } from '../../../../extension/common/sound-config';
import { SoundPicker } from './sound-picker';
import { SoundPreviewButton } from './sound-preview-button';
import { ChevronIcon, SoundIcon } from '../../ui/icons';

interface SoundSelectFieldProps {
  name: string;
  label: string;
  disabled?: boolean;
}

/**
 * Enhanced sound selection field with modal picker and preview.
 * Replaces the native select dropdown with a rich modal-based picker.
 */
export function SoundSelectField({ name, label, disabled = false }: SoundSelectFieldProps) {
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

            <div className="flex items-center gap-2">
              {/* Inline preview button */}
              <SoundPreviewButton sound={soundValue} disabled={disabled} size="sm" />

              {/* Sound selector button */}
              <button
                type="button"
                onClick={openPicker}
                disabled={disabled}
                className="btn btn-sm btn-outline gap-2 min-w-0 h-8 px-3"
                aria-label={`Current sound: ${soundDefinition?.name || soundValue}. Click to change.`}
              >
                <SoundIcon sound={soundValue} className="size-4" />
                <span className="text-sm font-normal">{soundDefinition?.name || soundValue}</span>
                <ChevronIcon className="size-3.5 opacity-60" />
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
}
