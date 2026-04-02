import { useState, useCallback, useRef } from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import type { ExtensionSettings } from '../types';
import type { NotificationSound } from '../../../../extension/common/types';
import { getSoundDefinition, isPlayableSound } from '../../../../extension/common/sound-config';
import { SoundPicker } from './sound-picker';
import { SoundPreviewButton } from './sound-preview-button';
import { MusicIcon } from '../../ui/icons';

interface SoundSelectFieldProps {
  name: string;
  label: string;
  disabled?: boolean;
}

/**
 * Sound selection field with inline on/off toggle, clickable badge, and modal picker.
 */
export const SoundSelectField = ({ name, label, disabled = false }: SoundSelectFieldProps) => {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const { control } = useFormContext<ExtensionSettings>();
  const lastPlayableSoundRef = useRef<Exclude<NotificationSound, 'off'>>('ping');

  const closePicker = useCallback(() => {
    setIsPickerOpen(false);
  }, []);

  return (
    <Controller
      name={name as 'assigned.sound' | 'merged.sound'}
      control={control}
      render={({ field: { value, onChange } }) => {
        const soundValue = value as NotificationSound;
        const soundEnabled = isPlayableSound(soundValue);

        if (soundEnabled) {
          lastPlayableSoundRef.current = soundValue as Exclude<NotificationSound, 'off'>;
        }

        const displaySound = soundEnabled ? soundValue : lastPlayableSoundRef.current;
        const soundDefinition = getSoundDefinition(displaySound);

        const handleToggle = () => {
          if (soundEnabled) {
            lastPlayableSoundRef.current = soundValue as Exclude<NotificationSound, 'off'>;
            onChange('off');
          } else {
            onChange(lastPlayableSoundRef.current);
          }
        };

        const openPicker = () => {
          if (!disabled && soundEnabled) {
            setIsPickerOpen(true);
          }
        };

        const handleSoundChange = (newSound: NotificationSound) => {
          if (isPlayableSound(newSound)) {
            lastPlayableSoundRef.current = newSound as Exclude<NotificationSound, 'off'>;
          }
          onChange(newSound);
        };

        return (
          <div
            className={`flex items-center justify-between gap-3 transition-opacity duration-200 ${
              disabled ? 'opacity-40 pointer-events-none' : ''
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-base-content">{label}</span>
              <div
                className={`flex items-center gap-2 transition-opacity duration-200 ${
                  soundEnabled ? '' : 'opacity-40 pointer-events-none'
                }`}
              >
                <SoundPreviewButton sound={displaySound} disabled={disabled} size="sm" />

                <button
                  type="button"
                  onClick={openPicker}
                  disabled={!soundEnabled || disabled}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary ring-1 ring-primary/20 transition-all duration-200 hover:bg-primary/15 hover:ring-primary/40 hover:shadow-sm cursor-pointer"
                  aria-label={`Current sound: ${soundDefinition?.name || displaySound}. Click to change.`}
                >
                  <MusicIcon className="size-3" />
                  {soundDefinition?.name || displaySound}
                </button>
              </div>
            </div>

            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={handleToggle}
              disabled={disabled}
              className="toggle toggle-sm toggle-primary shrink-0"
            />

            <SoundPicker
              value={displaySound}
              onChange={handleSoundChange}
              isOpen={isPickerOpen}
              onClose={closePicker}
            />
          </div>
        );
      }}
    />
  );
};
