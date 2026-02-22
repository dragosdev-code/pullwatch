import { useState, useCallback } from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import type { ExtensionSettings } from '../types';
import type { NotificationSound } from '../../../../extension/common/types';
import { getSoundDefinition } from '../../../../extension/common/sound-config';
import { SoundPicker } from './sound-picker';
import { SoundPreviewButton } from './sound-preview-button';

interface SoundSelectFieldProps {
  name: string;
  label: string;
  disabled?: boolean;
}

/**
 * Chevron/arrow icon for the dropdown button
 */
function ChevronIcon({ className = 'size-4' }: { className?: string }) {
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
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/**
 * Sound icon that changes based on the selected sound type
 */
function SoundIcon({ sound, className = 'size-4' }: { sound: NotificationSound; className?: string }) {
  const definition = getSoundDefinition(sound);

  if (!definition || definition.icon === 'mute') {
    // Mute/off icon
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

  if (definition.icon === 'bell') {
    // Bell icon
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

  // Wave/sound icon (default for ping)
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
    </svg>
  );
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
