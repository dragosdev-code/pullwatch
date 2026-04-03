import { useState, useCallback, useRef } from 'react';
import { previewInterval } from '../../../lib/audio-utils';

/**
 * Manages audio preview playback for the trimmed selection.
 *
 * @param audioBuffer - The decoded audio buffer, or null if no file is loaded.
 * @param startS - Trim start in seconds.
 * @param endS - Trim end in seconds.
 *
 * @returns `isPlaying` — whether a preview is currently active,
 *          `togglePreview` — starts or stops playback,
 *          `stopPreview` — imperatively stops playback (used by resetEditor).
 */
export const useAudioPreview = (
  audioBuffer: AudioBuffer | null,
  startS: number,
  endS: number,
) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);

  /**
   * Imperatively stops any active preview and cleans up the timeout.
   * Called by the parent's resetEditor to kill playback on file-change / close.
   */
  const stopPreview = useCallback(() => {
    if (stopRef.current) {
      stopRef.current();
      stopRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const togglePreview = useCallback(() => {
    if (!audioBuffer) return;

    // If already playing, stop.
    if (isPlaying && stopRef.current) {
      stopRef.current();
      stopRef.current = null;
      setIsPlaying(false);
      return;
    }

    const handle = previewInterval(audioBuffer, startS, endS);
    stopRef.current = handle.stop;
    setIsPlaying(true);

    /**
     * WHY `(endS - startS) * 1000 + 100` for the auto-stop timeout:
     * Web Audio `source.start(0, offset, duration)` is sample-accurate, but
     * the `onended` event fires asynchronously on the main thread and can be
     * delayed by layout / GC. The +100ms buffer ensures we don't flip
     * `isPlaying` to false *before* the browser considers the source ended,
     * which would cause a brief visual glitch (button flickers to "Play"
     * then back to "Stop" on the ended callback).
     */
    const timeout = setTimeout(
      () => {
        setIsPlaying(false);
        stopRef.current = null;
      },
      (endS - startS) * 1000 + 100,
    );

    /**
     * WHY we monkey-patch handle.stop: the original stop function from
     * previewInterval doesn't know about our timeout. If the user clicks
     * Stop manually, we must clear the timeout to prevent it from firing
     * after playback has already been stopped.
     */
    const originalStop = handle.stop;
    handle.stop = () => {
      clearTimeout(timeout);
      originalStop();
    };
    stopRef.current = handle.stop;
  }, [audioBuffer, startS, endS, isPlaying]);

  return { isPlaying, togglePreview, stopPreview };
};
