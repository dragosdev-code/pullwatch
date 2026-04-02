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
// Clamp helpers
// ---------------------------------------------------------------------------
function clampStartS(next: number, currentEndS: number): number {
  const capped = Math.min(next, currentEndS - 0.1);
  const floor = Math.max(0, currentEndS - MAX_CUSTOM_SOUND_DURATION_S);
  return Math.max(floor, Math.max(0, capped));
}

function clampEndS(next: number, currentStartS: number, dur: number): number {
  const floored = Math.max(next, currentStartS + 0.1);
  const cap = Math.min(dur, currentStartS + MAX_CUSTOM_SOUND_DURATION_S);
  return Math.min(cap, Math.min(dur, floored));
}

function clampMoveWindow(
  nextStart: number,
  length: number,
  dur: number,
): { startS: number; endS: number } {
  const s = Math.max(0, Math.min(nextStart, dur - length));
  return { startS: s, endS: s + length };
}

// ---------------------------------------------------------------------------
// Waveform Canvas — draggable trim
// ---------------------------------------------------------------------------
type DragMode = 'start' | 'end' | 'move';

type HoverZone = DragMode | null;

interface DragState {
  mode: DragMode;
  t0: number;
  s0: number;
  e0: number;
  dur: number;
}

function hitMarginPx(canvasWidth: number): number {
  return Math.max(8, Math.min(12, canvasWidth * 0.025));
}

/** DaisyUI exposes `--color-*` as full `oklch(...)`; avoid `oklch(${var} / a)` (invalid nesting). */
function oklchWithAlpha(themeColorValue: string, alpha: number, fallbackChannels: string): string {
  const raw = (themeColorValue || '').trim() || fallbackChannels;
  const m = raw.match(/^oklch\(\s*(.+)\s*\)$/i);
  if (m) {
    let inner = m[1].trim().replace(/\s*\/\s*[\d.]+\s*$/i, '').trim();
    return `oklch(${inner} / ${alpha})`;
  }
  return `oklch(${raw} / ${alpha})`;
}

interface WaveformProps {
  peaks: number[];
  startS: number;
  endS: number;
  duration: number;
  setStartS: (v: number) => void;
  setEndS: (v: number) => void;
}

function Waveform({ peaks, startS, endS, duration, setStartS, setEndS }: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const drawFnRef = useRef<() => void>(() => {});
  const dragRef = useRef<DragState | null>(null);
  const hoverZoneRef = useRef<HoverZone>(null);
  const trimRef = useRef({ startS, endS, duration });
  trimRef.current = { startS, endS, duration };
  const [cursor, setCursor] = useState('default');

  useEffect(() => {
    drawFnRef.current = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);

      const w = rect.width;
      const h = rect.height;
      const barWidth = Math.max(1, (w / peaks.length) * 0.7);
      const gap = w / peaks.length;

      const style = getComputedStyle(canvas);
      const baseContentRaw =
        style.getPropertyValue('--color-base-content').trim() || '21% 0.006 285.885';
      const primaryRaw = style.getPropertyValue('--color-primary').trim() || '45% 0.24 277';
      const handleChRaw =
        style.getPropertyValue('--color-secondary').trim() ||
        style.getPropertyValue('--color-accent').trim() ||
        style.getPropertyValue('--color-neutral').trim() ||
        '65% 0.241 354';

      ctx.clearRect(0, 0, w, h);

      const { startS: s0, endS: e0, duration: dur } = trimRef.current;
      const selStart = dur > 0 ? (s0 / dur) * w : 0;
      const selEnd = dur > 0 ? (e0 / dur) * w : w;
      const selW = selEnd - selStart;
      const hm = hitMarginPx(w);
      const mid = selStart + selW / 2;
      let leftZoneEnd = Math.min(selStart + hm, mid);
      let rightZoneStart = Math.max(selEnd - hm, mid);
      if (leftZoneEnd > rightZoneStart) {
        leftZoneEnd = mid;
        rightZoneStart = mid;
      }

      const hover = hoverZoneRef.current;
      const dragMode = dragRef.current?.mode ?? null;
      const activeStart = dragMode === 'start' || hover === 'start';
      const activeEnd = dragMode === 'end' || hover === 'end';
      const activeMove = dragMode === 'move' || hover === 'move';

      const barCenterX = (i: number) => i * gap + barWidth * 0.5;

      const barFillForPeakIndex = (i: number): string => {
        const cx = barCenterX(i);
        if (cx < selStart || cx > selEnd) {
          return oklchWithAlpha(baseContentRaw, 0.4, '21% 0.006 285.885');
        }
        if (cx < leftZoneEnd) {
          return oklchWithAlpha(handleChRaw, activeStart ? 0.62 : 0.52, '65% 0.241 354');
        }
        if (cx > rightZoneStart) {
          return oklchWithAlpha(handleChRaw, activeEnd ? 0.62 : 0.52, '65% 0.241 354');
        }
        return oklchWithAlpha(primaryRaw, activeMove ? 0.64 : 0.58, '45% 0.24 277');
      };

      for (let i = 0; i < peaks.length; i++) {
        const x = i * gap;
        const amplitude = peaks[i] * (h / 2) * 0.9;
        ctx.fillStyle = barFillForPeakIndex(i);
        ctx.fillRect(x, h / 2 - amplitude, barWidth, amplitude * 2 || 1);
      }

      const excludedAlpha = 0.16;
      ctx.fillStyle = oklchWithAlpha(baseContentRaw, excludedAlpha, '21% 0.006 285.885');
      if (selStart > 0.5) {
        ctx.fillRect(0, 0, selStart, h);
      }
      if (selEnd < w - 0.5) {
        ctx.fillRect(selEnd, 0, w - selEnd, h);
      }

      const fillHandleIdle = 0.12;
      const fillHandleActive = 0.22;
      const fillMoveIdle = 0.08;
      const fillMoveActive = 0.12;

      ctx.fillStyle = oklchWithAlpha(
        handleChRaw,
        activeStart ? fillHandleActive : fillHandleIdle,
        '65% 0.241 354',
      );
      ctx.fillRect(selStart, 0, leftZoneEnd - selStart, h);
      ctx.fillStyle = oklchWithAlpha(
        primaryRaw,
        activeMove ? fillMoveActive : fillMoveIdle,
        '45% 0.24 277',
      );
      ctx.fillRect(leftZoneEnd, 0, rightZoneStart - leftZoneEnd, h);
      ctx.fillStyle = oklchWithAlpha(
        handleChRaw,
        activeEnd ? fillHandleActive : fillHandleIdle,
        '65% 0.241 354',
      );
      ctx.fillRect(rightZoneStart, 0, selEnd - rightZoneStart, h);

      ctx.strokeStyle = oklchWithAlpha(baseContentRaw, 0.28, '21% 0.006 285.885');
      ctx.lineWidth = 1;
      if (leftZoneEnd > selStart + 0.5) {
        ctx.beginPath();
        ctx.moveTo(leftZoneEnd, 0);
        ctx.lineTo(leftZoneEnd, h);
        ctx.stroke();
      }
      if (rightZoneStart < selEnd - 0.5 && rightZoneStart > leftZoneEnd + 0.5) {
        ctx.beginPath();
        ctx.moveTo(rightZoneStart, 0);
        ctx.lineTo(rightZoneStart, h);
        ctx.stroke();
      }

      const capLen = 5;
      const edgeLine = (at: number, capsRight: boolean, active: boolean) => {
        ctx.strokeStyle = active
          ? oklchWithAlpha(primaryRaw, 0.92, '45% 0.24 277')
          : oklchWithAlpha(baseContentRaw, 0.52, '21% 0.006 285.885');
        ctx.lineWidth = active ? 3 : 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(at, 0);
        ctx.lineTo(at, h);
        ctx.moveTo(at, 2);
        ctx.lineTo(capsRight ? at + capLen : at - capLen, 2);
        ctx.moveTo(at, h - 2);
        ctx.lineTo(capsRight ? at + capLen : at - capLen, h - 2);
        ctx.stroke();
      };
      edgeLine(selStart, true, activeStart);
      edgeLine(selEnd, false, activeEnd);
    };
    drawFnRef.current();
  }, [peaks, startS, endS, duration]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => drawFnRef.current());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const hitTest = useCallback(
    (clientX: number): DragMode | null => {
      const canvas = canvasRef.current;
      if (!canvas || duration === 0) return null;
      const rect = canvas.getBoundingClientRect();
      const px = clientX - rect.left;
      const w = rect.width;
      const startPx = (startS / duration) * w;
      const endPx = (endS / duration) * w;
      const hitMargin = hitMarginPx(w);
      if (Math.abs(px - startPx) <= hitMargin) return 'start';
      if (Math.abs(px - endPx) <= hitMargin) return 'end';
      if (px > startPx + hitMargin && px < endPx - hitMargin) return 'move';
      return null;
    },
    [startS, endS, duration],
  );

  const pxToTime = useCallback(
    (clientX: number): number => {
      const canvas = canvasRef.current;
      if (!canvas) return 0;
      const rect = canvas.getBoundingClientRect();
      return Math.max(0, Math.min(((clientX - rect.left) / rect.width) * duration, duration));
    },
    [duration],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (duration === 0) return;
      const mode = hitTest(e.clientX);
      if (!mode) return;
      e.preventDefault();
      wrapperRef.current?.setPointerCapture(e.pointerId);
      dragRef.current = { mode, t0: pxToTime(e.clientX), s0: startS, e0: endS, dur: duration };
      setCursor(mode === 'move' ? 'grabbing' : 'ew-resize');
      drawFnRef.current();
    },
    [duration, hitTest, pxToTime, startS, endS],
  );

  const syncHoverFromClientX = useCallback(
    (clientX: number) => {
      const next = hitTest(clientX);
      if (hoverZoneRef.current !== next) {
        hoverZoneRef.current = next;
        drawFnRef.current();
      }
    },
    [hitTest],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) {
        const mode = hitTest(e.clientX);
        syncHoverFromClientX(e.clientX);
        setCursor(mode === 'move' ? 'grab' : mode ? 'ew-resize' : 'default');
        return;
      }
      const t = pxToTime(e.clientX);
      if (drag.mode === 'start') {
        setStartS(clampStartS(t, drag.e0));
      } else if (drag.mode === 'end') {
        setEndS(clampEndS(t, drag.s0, drag.dur));
      } else {
        const { startS: ns, endS: ne } = clampMoveWindow(
          drag.s0 + (t - drag.t0),
          drag.e0 - drag.s0,
          drag.dur,
        );
        setStartS(ns);
        setEndS(ne);
      }
    },
    [hitTest, pxToTime, setStartS, setEndS, syncHoverFromClientX],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      dragRef.current = null;
      if (duration > 0) {
        syncHoverFromClientX(e.clientX);
        const mode = hitTest(e.clientX);
        setCursor(mode === 'move' ? 'grab' : mode ? 'ew-resize' : 'default');
      } else {
        setCursor('default');
      }
      drawFnRef.current();
    },
    [duration, hitTest, syncHoverFromClientX],
  );

  const handlePointerCancel = useCallback(() => {
    dragRef.current = null;
    hoverZoneRef.current = null;
    setCursor('default');
    drawFnRef.current();
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="rounded-lg"
      style={{ cursor, touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={() => {
        if (!dragRef.current) {
          if (hoverZoneRef.current !== null) {
            hoverZoneRef.current = null;
            drawFnRef.current();
          }
          setCursor('default');
        }
      }}
    >
      <canvas
        ref={canvasRef}
        className="block w-full h-24 rounded-lg border border-base-300 bg-base-200"
      />
    </div>
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

                <Waveform
                  peaks={peaks}
                  startS={startS}
                  endS={endS}
                  duration={duration}
                  setStartS={setStartS}
                  setEndS={setEndS}
                />

                <p className="text-[11px] text-base-content/50 text-center leading-snug">
                  <span className="font-medium text-base-content/70">Edges:</span> trim start/end
                  <span className="mx-1">&middot;</span>
                  <span className="font-medium text-base-content/70">Center:</span> move selection
                </p>

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
                <p className="text-xs text-base-content/40 text-center">
                  Drag handles or region to trim &middot; max {MAX_CUSTOM_SOUND_DURATION_S}s &middot;{' '}
                  {duration.toFixed(1)}s total
                </p>
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
