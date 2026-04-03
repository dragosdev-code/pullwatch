import { useCallback, useEffect, useRef } from 'react';
import { useFormContext } from 'react-hook-form';
import { useStore } from 'zustand';
import type { CustomSoundId } from '../../../extension/common/types';
import {
  MAX_CUSTOM_SOUND_FILE_SIZE_BYTES,
  MAX_CUSTOM_SOUND_NAME_LENGTH,
} from '../../../extension/common/constants';
import {
  decodeAudioFile,
  trimAudioBuffer,
  audioBufferToWavBase64,
} from '../../lib/audio-utils';
import { useCustomSounds } from '../../hooks/use-custom-sounds';
import { useAudioPreview } from './hooks/use-audio-preview';
import { CustomSoundEditorHeader } from './components/custom-sound-editor-header';
import { CustomSoundEditorFooter } from './components/custom-sound-editor-footer';
import { CustomSoundUploadArea } from './components/custom-sound-upload-area';
import { CustomSoundTrimPanel } from './components/custom-sound-trim-panel';
import { CustomSoundNameField } from './components/custom-sound-name-field';
import { SavedSoundsSection } from './components/saved-sounds-section';
import { useAudioDraftStore } from './context/audio-draft-store-context';
import { useAsyncFeedbackStore } from './context/async-feedback-store-context';
import { useSavedDeleteUi } from './context/saved-delete-ui-context';
import type { CustomSoundEditorProps, SoundNameForm } from './types';

/**
 * Glue layer: workflows (upload, save, close) compose draft store, async feedback,
 * delete UI, RHF, and persistence. Slices own facts only; this module owns reset order.
 */
export function CustomSoundEditorShell({
  isOpen,
  onClose,
  onSaved,
}: CustomSoundEditorProps) {
  const modalRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const audioDraftStore = useAudioDraftStore();
  const asyncFeedbackStore = useAsyncFeedbackStore();
  const { pendingDeleteId, setPendingDeleteId, clearPendingDelete } = useSavedDeleteUi();

  const { customSounds, canAddMore, saveCustomSound, deleteCustomSound } = useCustomSounds();

  const {
    watch,
    setValue,
    reset,
    trigger,
    formState: { errors, isValid },
  } = useFormContext<SoundNameForm>();

  const watchedName = watch('soundName');

  const audioBuffer = useStore(audioDraftStore, (s) => s.audioBuffer);
  const peaks = useStore(audioDraftStore, (s) => s.peaks);
  const fileName = useStore(audioDraftStore, (s) => s.fileName);
  const startS = useStore(audioDraftStore, (s) => s.startS);
  const endS = useStore(audioDraftStore, (s) => s.endS);
  const setStartS = useStore(audioDraftStore, (s) => s.setStartS);
  const setEndS = useStore(audioDraftStore, (s) => s.setEndS);

  const error = useStore(asyncFeedbackStore, (s) => s.error);
  const isSaving = useStore(asyncFeedbackStore, (s) => s.isSaving);
  const setError = useStore(asyncFeedbackStore, (s) => s.setError);
  const setSaving = useStore(asyncFeedbackStore, (s) => s.setSaving);

  const duration = audioBuffer?.duration ?? 0;
  const selectedDuration = endS - startS;
  const existingNamesForValidation = customSounds.map((s) => s.name);

  const { isPlaying, togglePreview, stopPreview } = useAudioPreview(audioBuffer, startS, endS);

  useEffect(() => {
    void trigger('soundName');
  }, [customSounds, trigger]);

  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;
    if (isOpen) {
      modal.showModal();
    } else {
      modal.close();
    }
  }, [isOpen]);

  const resetAllSlices = useCallback(() => {
    audioDraftStore.getState().reset();
    asyncFeedbackStore.getState().reset();
    clearPendingDelete();
    reset({ soundName: '' });
    stopPreview();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [audioDraftStore, asyncFeedbackStore, clearPendingDelete, reset, stopPreview]);

  const handleClose = useCallback(() => {
    resetAllSlices();
    onClose();
  }, [onClose, resetAllSlices]);

  const handleFileChange = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setError(null);

      if (file.size > MAX_CUSTOM_SOUND_FILE_SIZE_BYTES) {
        setError(
          `File too large. Maximum size is ${MAX_CUSTOM_SOUND_FILE_SIZE_BYTES / 1024 / 1024}MB.`,
        );
        return;
      }

      try {
        const buffer = await decodeAudioFile(file);
        const baseName = file.name.replace(/\.[^.]+$/, '');
        audioDraftStore.getState().applyDecoded(buffer, baseName);
        setValue('soundName', baseName.slice(0, MAX_CUSTOM_SOUND_NAME_LENGTH), {
          shouldValidate: true,
        });
      } catch {
        setError('Could not decode audio file. Try a different format (MP3, WAV, OGG).');
      }
    },
    [audioDraftStore, setError, setValue],
  );

  const handleSave = useCallback(async () => {
    if (!audioBuffer || !watchedName?.trim()) return;
    setSaving(true);
    setError(null);

    try {
      const trimmed = await trimAudioBuffer(audioBuffer, startS, endS);
      const base64 = audioBufferToWavBase64(trimmed);
      const durationMs = Math.round((endS - startS) * 1000);
      const id = await saveCustomSound(watchedName, base64, durationMs);
      resetAllSlices();
      onSaved?.(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save sound');
    } finally {
      setSaving(false);
    }
  }, [
    audioBuffer,
    watchedName,
    startS,
    endS,
    saveCustomSound,
    resetAllSlices,
    onSaved,
    setError,
    setSaving,
  ]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target === modalRef.current) handleClose();
    },
    [handleClose],
  );

  const canSave =
    Boolean(audioBuffer) &&
    canAddMore &&
    !isSaving &&
    isValid &&
    Boolean(watchedName?.trim()) &&
    !errors.soundName;

  const confirmDeleteSound = useCallback(
    (id: CustomSoundId) => {
      deleteCustomSound(id);
      clearPendingDelete();
    },
    [deleteCustomSound, clearPendingDelete],
  );

  return (
    <dialog
      ref={modalRef}
      className="modal"
      onClick={handleBackdropClick}
      onKeyDown={(e) => {
        if (e.key === 'Escape') handleClose();
      }}
    >
      <div className="modal-box max-w-md max-h-[min(100vh,32rem)] p-0 overflow-hidden flex flex-col">
        <CustomSoundEditorHeader onClose={handleClose} />

        {audioBuffer && (
          <div className="px-3 py-1 shrink-0 border-b border-warning/20 bg-warning/10 text-[11px] leading-tight text-base-content/85 min-w-0">
            <p className="truncate whitespace-nowrap">
              <span className="font-medium">Unsaved:</span> Save before closing or you lose this
              sound.
            </p>
          </div>
        )}

        <div className="p-4 space-y-4 flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {!audioBuffer && (
            <CustomSoundUploadArea fileInputRef={fileInputRef} onFileChange={handleFileChange} />
          )}

          {audioBuffer && (
            <CustomSoundTrimPanel
              fileName={fileName}
              peaks={peaks}
              startS={startS}
              endS={endS}
              duration={duration}
              selectedDuration={selectedDuration}
              isPlaying={isPlaying}
              onTogglePreview={togglePreview}
              onChangeFile={resetAllSlices}
              setStartS={setStartS}
              setEndS={setEndS}
            />
          )}

          <div className={audioBuffer ? '' : 'hidden'} aria-hidden={!audioBuffer}>
            <CustomSoundNameField disabled={!audioBuffer} existingNames={existingNamesForValidation} />
          </div>

          {error && (
            <div className="alert alert-error alert-sm text-xs py-2">
              <span>{error}</span>
            </div>
          )}

          {customSounds.length > 0 && (
            <SavedSoundsSection
              customSounds={customSounds}
              pendingDeleteId={pendingDeleteId}
              onRequestDelete={setPendingDeleteId}
              onConfirmDelete={confirmDeleteSound}
              onCancelDelete={clearPendingDelete}
            />
          )}

          {!canAddMore && audioBuffer && (
            <div className="alert alert-warning text-xs py-2">
              <span>Maximum custom sounds reached. Delete one to upload another.</span>
            </div>
          )}
        </div>

        <CustomSoundEditorFooter
          onClose={handleClose}
          onSave={handleSave}
          canSave={canSave}
          isSaving={isSaving}
        />
      </div>

      <form method="dialog" className="modal-backdrop">
        <button onClick={handleClose}>close</button>
      </form>
    </dialog>
  );
}
