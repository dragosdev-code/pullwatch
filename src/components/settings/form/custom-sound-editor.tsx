import { useState, useCallback, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import type { CustomSoundId, CustomSoundMeta } from '../../../../extension/common/types';
import {
  MAX_CUSTOM_SOUND_DURATION_S,
  MAX_CUSTOM_SOUND_FILE_SIZE_BYTES,
  MAX_CUSTOM_SOUND_NAME_LENGTH,
} from '../../../../extension/common/constants';
import { validateCustomSoundName } from '../../../../extension/common/custom-sound-name';
import {
  decodeAudioFile,
  trimAudioBuffer,
  audioBufferToWavBase64,
  previewInterval,
  getWaveformPeaks,
} from '../../../lib/audio-utils';
import { useCustomSounds } from '../../../hooks/use-custom-sounds';
import { PlayIcon, XIcon, CheckIcon } from '../../ui/icons';
import { SoundPreviewButton } from './sound-preview-button';
import { TruncatedOneLineWithTooltip } from '../../ui/truncated-one-line-with-tooltip';

type SoundNameForm = { soundName: string };

// ---------------------------------------------------------------------------
// Waveform Canvas
// ---------------------------------------------------------------------------
interface WaveformProps {
  peaks: number[];
  startPct: number;
  endPct: number;
}

function Waveform({ peaks, startPct, endPct }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const barWidth = Math.max(1, (w / peaks.length) * 0.7);
    const gap = w / peaks.length;

    const style = getComputedStyle(canvas);
    const baseContent = style.getPropertyValue('--color-base-content').trim() || '0 0% 20%';
    const primary = style.getPropertyValue('--color-primary').trim() || '262 80% 50%';

    ctx.clearRect(0, 0, w, h);

    const selStart = startPct * w;
    const selEnd = endPct * w;
    ctx.fillStyle = `oklch(${primary} / 0.12)`;
    ctx.fillRect(selStart, 0, selEnd - selStart, h);

    for (let i = 0; i < peaks.length; i++) {
      const x = i * gap;
      const isInSelection = x >= selStart && x <= selEnd;
      const amplitude = peaks[i] * (h / 2) * 0.9;

      ctx.fillStyle = isInSelection ? `oklch(${primary} / 0.7)` : `oklch(${baseContent} / 0.25)`;

      ctx.fillRect(x, h / 2 - amplitude, barWidth, amplitude * 2 || 1);
    }

    ctx.strokeStyle = `oklch(${primary} / 0.6)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(selStart, 0);
    ctx.lineTo(selStart, h);
    ctx.moveTo(selEnd, 0);
    ctx.lineTo(selEnd, h);
    ctx.stroke();
  }, [peaks, startPct, endPct]);

  return (
    <canvas ref={canvasRef} className="w-full h-24 rounded-lg border border-base-300 bg-base-200" />
  );
}

// ---------------------------------------------------------------------------
// Saved Sound Row
// ---------------------------------------------------------------------------
interface SavedSoundRowProps {
  meta: CustomSoundMeta;
  isConfirming: boolean;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}

function SavedSoundRow({
  meta,
  isConfirming,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: SavedSoundRowProps) {
  if (isConfirming) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg bg-base-200/80 border border-base-300">
        <span className="flex-1 text-xs text-base-content">Remove &ldquo;{meta.name}&rdquo;?</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onConfirmDelete();
          }}
          className="btn btn-ghost btn-xs btn-circle text-success hover:bg-success/15"
          aria-label="Confirm delete"
        >
          <CheckIcon className="size-3.5 text-success" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCancelDelete();
          }}
          className="btn btn-ghost btn-xs btn-circle text-base-content/50 hover:text-base-content hover:bg-base-300/50"
          aria-label="Cancel delete"
        >
          <XIcon className="size-3" width={12} height={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-base-100 border border-base-200">
      <span className="flex-1 text-sm font-medium text-base-content truncate">{meta.name}</span>
      <span className="badge badge-sm badge-ghost">{(meta.durationMs / 1000).toFixed(1)}s</span>
      <div onClick={(e) => e.stopPropagation()} className="shrink-0">
        <SoundPreviewButton sound={meta.id} size="sm" playbackDurationMs={meta.durationMs + 150} />
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRequestDelete();
        }}
        className="btn btn-ghost btn-xs btn-circle text-error/60 hover:text-error hover:bg-error/10 shrink-0"
        aria-label={`Delete ${meta.name}`}
      >
        <XIcon className="size-3" width={12} height={12} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CustomSoundEditor
// ---------------------------------------------------------------------------
interface CustomSoundEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (id: CustomSoundId) => void;
}

export const CustomSoundEditor = ({ isOpen, onClose, onSaved }: CustomSoundEditorProps) => {
  const modalRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { customSounds, canAddMore, saveCustomSound, deleteCustomSound } = useCustomSounds();

  const [pendingDeleteId, setPendingDeleteId] = useState<CustomSoundId | null>(null);

  const {
    register,
    watch,
    setValue,
    reset,
    trigger,
    formState: { errors, isValid },
  } = useForm<SoundNameForm>({
    mode: 'onChange',
    reValidateMode: 'onChange',
    defaultValues: { soundName: '' },
  });

  const watchedName = watch('soundName');

  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [peaks, setPeaks] = useState<number[]>([]);
  const [fileName, setFileName] = useState('');
  const [startS, setStartS] = useState(0);
  const [endS, setEndS] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopRef = useRef<(() => void) | null>(null);

  const duration = audioBuffer?.duration ?? 0;
  const selectedDuration = endS - startS;

  const existingNamesForValidation = customSounds.map((s) => s.name);

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

  const resetEditor = useCallback(() => {
    setAudioBuffer(null);
    setPeaks([]);
    setFileName('');
    reset({ soundName: '' });
    setStartS(0);
    setEndS(0);
    setIsPlaying(false);
    setIsSaving(false);
    setError(null);
    setPendingDeleteId(null);
    if (stopRef.current) {
      stopRef.current();
      stopRef.current = null;
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [reset]);

  const handleClose = useCallback(() => {
    resetEditor();
    onClose();
  }, [onClose, resetEditor]);

  const handleFileChange = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setError(null);

      if (file.size > MAX_CUSTOM_SOUND_FILE_SIZE_BYTES) {
        setError(
          `File too large. Maximum size is ${MAX_CUSTOM_SOUND_FILE_SIZE_BYTES / 1024 / 1024}MB.`
        );
        return;
      }

      try {
        const buffer = await decodeAudioFile(file);
        setAudioBuffer(buffer);
        setPeaks(getWaveformPeaks(buffer, 120));
        const baseName = file.name.replace(/\.[^.]+$/, '');
        setFileName(baseName);
        setValue('soundName', baseName.slice(0, MAX_CUSTOM_SOUND_NAME_LENGTH), {
          shouldValidate: true,
        });
        setStartS(0);
        setEndS(Math.min(buffer.duration, MAX_CUSTOM_SOUND_DURATION_S));
      } catch {
        setError('Could not decode audio file. Try a different format (MP3, WAV, OGG).');
      }
    },
    [setValue]
  );

  const handleStartChange = useCallback(
    (val: number) => {
      const clamped = Math.min(val, endS - 0.1);
      const maxStart = Math.max(0, endS - MAX_CUSTOM_SOUND_DURATION_S);
      setStartS(Math.max(maxStart, Math.max(0, clamped)));
    },
    [endS]
  );

  const handleEndChange = useCallback(
    (val: number) => {
      const clamped = Math.max(val, startS + 0.1);
      const maxEnd = Math.min(duration, startS + MAX_CUSTOM_SOUND_DURATION_S);
      setEndS(Math.min(maxEnd, Math.min(duration, clamped)));
    },
    [startS, duration]
  );

  const handlePreview = useCallback(() => {
    if (!audioBuffer) return;
    if (isPlaying && stopRef.current) {
      stopRef.current();
      stopRef.current = null;
      setIsPlaying(false);
      return;
    }

    const handle = previewInterval(audioBuffer, startS, endS);
    stopRef.current = handle.stop;
    setIsPlaying(true);

    const timeout = setTimeout(
      () => {
        setIsPlaying(false);
        stopRef.current = null;
      },
      (endS - startS) * 1000 + 100
    );

    const originalStop = handle.stop;
    handle.stop = () => {
      clearTimeout(timeout);
      originalStop();
    };
    stopRef.current = handle.stop;
  }, [audioBuffer, startS, endS, isPlaying]);

  const handleSave = useCallback(async () => {
    if (!audioBuffer || !watchedName?.trim()) return;
    setIsSaving(true);
    setError(null);

    try {
      const trimmed = await trimAudioBuffer(audioBuffer, startS, endS);
      const base64 = audioBufferToWavBase64(trimmed);
      const durationMs = Math.round((endS - startS) * 1000);
      const id = await saveCustomSound(watchedName, base64, durationMs);
      resetEditor();
      onSaved?.(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save sound');
    } finally {
      setIsSaving(false);
    }
  }, [audioBuffer, watchedName, startS, endS, saveCustomSound, resetEditor, onSaved]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target === modalRef.current) handleClose();
    },
    [handleClose]
  );

  const canSave =
    Boolean(audioBuffer) &&
    canAddMore &&
    !isSaving &&
    isValid &&
    Boolean(watchedName?.trim()) &&
    !errors.soundName;

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
        <div className="px-5 py-4 border-b border-base-200 flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleClose}
            className="btn btn-ghost btn-sm btn-circle"
            aria-label="Close"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h3 className="font-semibold text-base-content">Custom Sound</h3>
            <p className="text-xs text-base-content/60">
              Upload and trim your own notification sound
            </p>
          </div>
        </div>

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
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={(e) => handleFileChange(e.target.files?.[0])}
                className="file-input file-input-bordered file-input-sm w-full"
              />
              <p className="text-xs text-base-content/50 text-center">
                MP3, WAV, OGG &mdash; max 10MB
              </p>
            </div>
          )}

          {audioBuffer && (
            <>
              <div className="space-y-2 min-w-0">
                <div className="flex items-center justify-between gap-2 min-w-0 w-full">
                  <TruncatedOneLineWithTooltip
                    text={fileName}
                    as="span"
                    tooltipPlacement="bottom"
                    tooltipHorizontalAnchor="end"
                    textClassName="block w-full min-w-0 text-xs text-base-content/60 truncate"
                    tooltipBodyClassName="text-center text-xs px-3 py-2 rounded-3xl whitespace-normal leading-relaxed"
                  />
                  <button
                    type="button"
                    onClick={resetEditor}
                    className="btn btn-ghost btn-xs shrink-0"
                  >
                    Change file
                  </button>
                </div>

                <Waveform peaks={peaks} startPct={startS / duration} endPct={endS / duration} />

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-base-content/60">
                    <span>Start: {startS.toFixed(1)}s</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handlePreview}
                        className={`btn btn-sm btn-ghost gap-1.5 ${isPlaying ? 'btn-active' : ''}`}
                      >
                        {isPlaying ? (
                          <>
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              className="size-3.5"
                            >
                              <path
                                fillRule="evenodd"
                                d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z"
                                clipRule="evenodd"
                              />
                            </svg>
                            Stop
                          </>
                        ) : (
                          <>
                            <PlayIcon className="size-3.5" />
                            Preview
                          </>
                        )}
                      </button>
                      <span className="badge badge-sm badge-primary">
                        {selectedDuration.toFixed(1)}s
                      </span>
                    </div>

                    <span>End: {endS.toFixed(1)}s</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={duration}
                    step={0.01}
                    value={startS}
                    onChange={(e) => handleStartChange(parseFloat(e.target.value))}
                    className="range range-primary range-xs w-full"
                  />
                  <input
                    type="range"
                    min={0}
                    max={duration}
                    step={0.01}
                    value={endS}
                    onChange={(e) => handleEndChange(parseFloat(e.target.value))}
                    className="range range-primary range-xs w-full"
                  />
                  <p className="text-xs text-base-content/40 text-center">
                    Max {MAX_CUSTOM_SOUND_DURATION_S}s &middot; Total: {duration.toFixed(1)}s
                  </p>
                </div>
              </div>
            </>
          )}

          <div className={audioBuffer ? '' : 'hidden'} aria-hidden={!audioBuffer}>
            <div className="form-control">
              <label className="label py-1" htmlFor="custom-sound-name">
                <span className="label-text text-xs">Sound name</span>
              </label>
              <input
                id="custom-sound-name"
                type="text"
                maxLength={MAX_CUSTOM_SOUND_NAME_LENGTH}
                autoComplete="off"
                placeholder="My notification sound"
                disabled={!audioBuffer}
                className={`input input-bordered input-sm w-full ${errors.soundName ? 'input-error' : ''}`}
                {...register('soundName', {
                  validate: (value) => {
                    const result = validateCustomSoundName(value, {
                      existingNames: existingNamesForValidation,
                    });
                    return result.ok || result.message;
                  },
                })}
              />
              <p className="text-[11px] text-base-content/50 mt-1 px-0.5">
                Letters, numbers, spaces, and . , - &apos; &middot; max{' '}
                {MAX_CUSTOM_SOUND_NAME_LENGTH} characters
              </p>
              {errors.soundName && (
                <p className="text-error text-xs mt-1 px-0.5" role="alert">
                  {errors.soundName.message}
                </p>
              )}
            </div>
          </div>

          {error && (
            <div className="alert alert-error alert-sm text-xs py-2">
              <span>{error}</span>
            </div>
          )}

          {customSounds.length > 0 && (
            <>
              <div className="divider text-xs text-base-content/40 my-2">
                Saved sounds ({customSounds.length}/3)
              </div>
              <div className="space-y-1.5">
                {customSounds.map((s) => (
                  <SavedSoundRow
                    key={s.id}
                    meta={s}
                    isConfirming={pendingDeleteId === s.id}
                    onRequestDelete={() => setPendingDeleteId(s.id)}
                    onConfirmDelete={() => {
                      deleteCustomSound(s.id);
                      setPendingDeleteId(null);
                    }}
                    onCancelDelete={() => setPendingDeleteId(null)}
                  />
                ))}
              </div>
            </>
          )}

          {!canAddMore && audioBuffer && (
            <div className="alert alert-warning text-xs py-2">
              <span>Maximum custom sounds reached. Delete one to upload another.</span>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-base-200 bg-base-100 flex justify-end gap-2 shrink-0">
          <button type="button" onClick={handleClose} className="btn btn-sm btn-ghost">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="btn btn-sm btn-primary"
          >
            {isSaving ? <span className="loading loading-spinner loading-sm" /> : 'Save Sound'}
          </button>
        </div>
      </div>

      <form method="dialog" className="modal-backdrop">
        <button onClick={handleClose}>close</button>
      </form>
    </dialog>
  );
};
