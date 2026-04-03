import { useState, useCallback, useRef, useEffect, type MutableRefObject, type ReactNode } from 'react';
import { useFormContext, Controller } from 'react-hook-form';
import type { ExtensionSettings } from '../types';
import type { NotificationSound, CustomSoundId } from '../../../../extension/common/types';
import {
  getSoundDefinition,
  isPlayableSound,
  isCustomSoundId,
  resolvePlayableSoundOrFallback,
} from '../../../../extension/common/sound-config';
import { useCustomSounds } from '../../../hooks/use-custom-sounds';
import { SoundPicker } from './sound-picker';
import { CustomSoundEditor } from '../../custom-sound-editor';
import { SoundPreviewButton } from './sound-preview-button';
import { MusicIcon } from '../../ui/icons';

interface SoundSelectFieldProps {
  name: string;
  label: string;
  disabled?: boolean;
}

type SoundFieldControllerProps = {
  value: NotificationSound;
  onChange: (v: NotificationSound) => void;
};

interface SoundSelectFieldInnerProps extends SoundFieldControllerProps {
  label: string;
  disabled: boolean;
  isPickerOpen: boolean;
  setIsPickerOpen: (open: boolean) => void;
  closePicker: () => void;
  openEditor: () => void;
  isEditorOpen: boolean;
  closeEditor: () => void;
  handleEditorSaved: (id: CustomSoundId) => void;
  pendingSoundRef: MutableRefObject<CustomSoundId | null>;
}

/**
 * Holds picker/editor UI and react-hook-form field wiring. Separated from the outer field
 * so we can use hooks (orphan custom migration) that must not run inside Controller’s render fn.
 */
function SoundSelectFieldInner({
  value: soundValue,
  onChange,
  label,
  disabled,
  isPickerOpen,
  setIsPickerOpen,
  closePicker,
  openEditor,
  isEditorOpen,
  closeEditor,
  handleEditorSaved,
  pendingSoundRef,
}: SoundSelectFieldInnerProps) {
  const { resolveDisplayName, customSounds, isLoading } = useCustomSounds();
  const lastPlayableSoundRef = useRef<Exclude<NotificationSound, 'off'>>('ping');

  // WHY wait for meta: on first paint `customSounds` is []—every custom_* would look orphaned
  // and we would incorrectly overwrite the form to ping before storage has loaded.
  useEffect(() => {
    if (isLoading) return;
    if (!isCustomSoundId(soundValue)) return;
    if (resolvePlayableSoundOrFallback(soundValue, customSounds) === soundValue) return;

    onChange('ping');
    lastPlayableSoundRef.current = 'ping';
  }, [isLoading, soundValue, customSounds, onChange]);

  const soundEnabled = isPlayableSound(soundValue);

  if (soundEnabled) {
    lastPlayableSoundRef.current = resolvePlayableSoundOrFallback(
      soundValue,
      customSounds,
    ) as Exclude<NotificationSound, 'off'>;
  }

  const rawDisplaySound = soundEnabled ? soundValue : lastPlayableSoundRef.current;
  const displaySound = resolvePlayableSoundOrFallback(rawDisplaySound, customSounds);

  const customName = isCustomSoundId(displaySound) ? resolveDisplayName(displaySound) : undefined;
  const soundDefinition = getSoundDefinition(displaySound);
  const displayName = customName || soundDefinition?.name || displaySound;

  const handleToggle = () => {
    if (soundEnabled) {
      lastPlayableSoundRef.current = resolvePlayableSoundOrFallback(
        soundValue,
        customSounds,
      ) as Exclude<NotificationSound, 'off'>;
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

  if (isPickerOpen && pendingSoundRef.current) {
    const saved = pendingSoundRef.current;
    pendingSoundRef.current = null;
    queueMicrotask(() => handleSoundChange(saved));
  }

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
            aria-label={`Current sound: ${displayName}. Click to change.`}
          >
            <MusicIcon className="size-3" />
            {displayName}
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
        onOpenCustomEditor={openEditor}
      />

      <CustomSoundEditor isOpen={isEditorOpen} onClose={closeEditor} onSaved={handleEditorSaved} />
    </div>
  );
}

/**
 * Sound selection field with inline on/off toggle, clickable badge, and two-modal flow
 * (SoundPicker for selection, CustomSoundEditor for upload/trim).
 */
export const SoundSelectField = ({
  name,
  label,
  disabled = false,
}: SoundSelectFieldProps): ReactNode => {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const { control } = useFormContext<ExtensionSettings>();
  const pendingSoundRef = useRef<CustomSoundId | null>(null);

  const closePicker = useCallback(() => {
    setIsPickerOpen(false);
  }, []);

  const openEditor = useCallback(() => {
    setIsPickerOpen(false);
    setIsEditorOpen(true);
  }, []);

  const closeEditor = useCallback(() => {
    setIsEditorOpen(false);
  }, []);

  const handleEditorSaved = useCallback((id: CustomSoundId) => {
    pendingSoundRef.current = id;
    setIsEditorOpen(false);
    setIsPickerOpen(true);
  }, []);

  return (
    <Controller
      name={name as 'assigned.sound' | 'merged.sound'}
      control={control}
      render={({ field: { value, onChange } }) => (
        <SoundSelectFieldInner
          value={value as NotificationSound}
          onChange={onChange}
          label={label}
          disabled={disabled}
          isPickerOpen={isPickerOpen}
          setIsPickerOpen={setIsPickerOpen}
          closePicker={closePicker}
          openEditor={openEditor}
          isEditorOpen={isEditorOpen}
          closeEditor={closeEditor}
          handleEditorSaved={handleEditorSaved}
          pendingSoundRef={pendingSoundRef}
        />
      )}
    />
  );
};
