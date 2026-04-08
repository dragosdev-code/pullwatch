import {
  useState,
  useCallback,
  useRef,
  useEffect,
  type MutableRefObject,
  type ReactNode,
} from 'react';
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

type SoundPickerTriggerButtonProps = {
  displayName: string;
  disabled?: boolean;
  onClick: () => void;
};

/**
 * WHY [UX]: Invisible grid “ghosts” size the pill to max(idle row, Change-only row) so short
 * names still fit “Change”, and long names don’t collapse on hover. Icon collapses with the name
 * swap.
 */
function SoundPickerTriggerButton({
  displayName,
  disabled,
  onClick,
}: SoundPickerTriggerButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group relative isolate inline-grid max-w-full cursor-pointer grid-cols-1 rounded-full bg-primary/10 py-1 text-xs font-semibold text-primary ring-1 ring-primary/20 transition-[background-color,box-shadow] duration-200 hover:bg-primary/15 hover:ring-primary/40 hover:shadow-sm disabled:cursor-not-allowed"
    >
      {/* Sizing only: cell width = max(icon+name, Change) so the pill never clips “Change” or shrinks past the idle label. */}
      <span className="col-start-1 row-start-1 flex min-w-0 items-center gap-1.5 px-2.5 opacity-0 pointer-events-none">
        <MusicIcon className="size-3 shrink-0" />
        <span className="min-w-0 max-w-48 truncate">{displayName}</span>
      </span>
      <span className="col-start-1 row-start-1 flex min-w-0 items-center px-2.5 opacity-0 pointer-events-none">
        <span className="whitespace-nowrap font-semibold tracking-wide">Change</span>
      </span>

      <span className="col-start-1 row-start-1 z-10 flex min-w-0 items-center gap-1.5 px-2.5 transition-[gap] duration-300 ease-out motion-reduce:duration-0 group-hover:gap-0">
        <span className="flex w-3 shrink-0 justify-center overflow-hidden transition-[width,opacity] duration-300 ease-out motion-reduce:duration-0 group-hover:w-0 group-hover:opacity-0">
          <MusicIcon className="size-3 shrink-0" />
        </span>
        <span className="relative min-h-[1.25em] min-w-0 max-w-48 flex-1 overflow-hidden">
          <span className="block truncate transition-[transform,opacity] duration-300 ease-out motion-reduce:duration-0 translate-y-0 opacity-100 group-hover:-translate-y-full group-hover:opacity-0">
            {displayName}
          </span>
          <span className="absolute inset-y-0 left-0 right-0 flex items-center justify-center transition-[transform,opacity] duration-300 ease-out motion-reduce:duration-0 translate-y-full opacity-0 group-hover:translate-y-0 group-hover:opacity-100">
            <span className="whitespace-nowrap tracking-wide">Change</span>
          </span>
        </span>
      </span>
    </button>
  );
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
      customSounds
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
        customSounds
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

          <SoundPickerTriggerButton
            displayName={displayName}
            disabled={!soundEnabled || disabled}
            onClick={openPicker}
          />
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
