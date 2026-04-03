import { useState, useCallback, useRef, useEffect, useId } from 'react';
import type { NotificationSound } from '../../../../extension/common/types';
import { isPlayableSound } from '../../../../extension/common/sound-config';
import { chromeExtensionService } from '../../../services/chrome-extension-service';
import {
  claimPreviewSession,
  getActivePreviewSessionId,
  releasePreviewSession,
  subscribePreviewSession,
} from '../../../services/sound-preview-session';
import { PlayIcon, PlayingAnimation } from '../../ui/icons';

interface SoundPreviewButtonProps {
  /** The sound to preview */
  sound: NotificationSound;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Optional size variant */
  size?: 'xs' | 'sm' | 'md';
  /**
   * How long to show the “playing” state after starting preview (ms).
   * Use clip duration + buffer for custom sounds; default matches short built-ins.
   */
  playbackDurationMs?: number;
  /**
   * Increment when preview should be reset from outside (e.g. row delete) so the playing UI clears.
   */
  playbackInterruptKey?: number;
}

/**
 * Inline sound preview button.
 * Allows quick testing of a sound without opening the full picker modal.
 */
const DEFAULT_PLAYBACK_UI_MS = 1000;

export const SoundPreviewButton = ({
  sound,
  disabled = false,
  size = 'sm',
  playbackDurationMs = DEFAULT_PLAYBACK_UI_MS,
  playbackInterruptKey = 0,
}: SoundPreviewButtonProps) => {
  // WHY useId: stable per mount so session ownership is unique even when two rows preview the same sound id (e.g. field + modal).
  const clientId = useId();
  const [isPlaying, setIsPlaying] = useState(false);
  const playTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevInterruptKeyRef = useRef(playbackInterruptKey);
  /** When true, ignore post-await scheduling (user stopped or parent interrupted while preview was in flight). */
  const discardPlayCompletionRef = useRef(false);

  const resetLocalPreviewUi = useCallback(() => {
    discardPlayCompletionRef.current = true;
    if (playTimeoutRef.current) {
      clearTimeout(playTimeoutRef.current);
      playTimeoutRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  // WHY subscribe: audio is global; when another button claims, this instance must hide the wave without receiving stop/stopSoundPreview itself.
  useEffect(() => {
    const unsubscribe = subscribePreviewSession(() => {
      if (getActivePreviewSessionId() !== clientId) {
        resetLocalPreviewUi();
      }
    });
    return unsubscribe;
  }, [clientId, resetLocalPreviewUi]);

  // WHY release on unmount: avoid leaving a zombie owner id that would block the next preview until something else claims.
  useEffect(() => {
    return () => {
      if (playTimeoutRef.current) {
        clearTimeout(playTimeoutRef.current);
      }
      releasePreviewSession(clientId);
    };
  }, [clientId]);

  // WHY release: e.g. picker delete while previewing—UI resets via key, but session must not still claim ownership for the next preview.
  useEffect(() => {
    if (playbackInterruptKey === prevInterruptKeyRef.current) return;
    prevInterruptKeyRef.current = playbackInterruptKey;
    resetLocalPreviewUi();
    releasePreviewSession(clientId);
  }, [playbackInterruptKey, clientId, resetLocalPreviewUi]);

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (!isPlayableSound(sound) || disabled) {
        return;
      }

      if (isPlaying) {
        // WHY release after stop: `subscribePreviewSession` clears UI; release nulls ownership so the next play is not treated as a steal mid-stop.
        void chromeExtensionService.stopSoundPreview();
        releasePreviewSession(clientId);
        return;
      }

      try {
        await claimPreviewSession(clientId);
      } catch (error) {
        console.error('[SoundPreviewButton] Failed to claim preview session:', error);
        return;
      }

      // WHY: claim notifies everyone synchronously; if we lost a race, do not start play or we stack SW requests.
      if (getActivePreviewSessionId() !== clientId) {
        return;
      }

      discardPlayCompletionRef.current = false;
      setIsPlaying(true);

      if (playTimeoutRef.current) {
        clearTimeout(playTimeoutRef.current);
      }

      try {
        await chromeExtensionService.playSoundPreview(sound);
      } catch (error) {
        console.error('[SoundPreviewButton] Failed to play sound:', error);
        releasePreviewSession(clientId);
        setIsPlaying(false);
        return;
      }

      // WHY discard check: user may have stopped or another button claimed while `playSoundPreview` was resolving.
      // WHY active-id check: same—superseded plays must not schedule the “fake playing” tail timeout.
      if (discardPlayCompletionRef.current || getActivePreviewSessionId() !== clientId) {
        return;
      }

      playTimeoutRef.current = setTimeout(() => {
        setIsPlaying(false);
        // WHY release after UI timeout: natural end should free the session like wave-click stop does.
        releasePreviewSession(clientId);
      }, playbackDurationMs);
    },
    [sound, isPlaying, disabled, playbackDurationMs, clientId]
  );

  // Don't render if sound is 'off' or disabled
  if (!isPlayableSound(sound) || disabled) {
    return null;
  }

  // Size variants
  const sizeClasses = {
    xs: 'btn-xs min-h-0 h-6 w-6 min-w-0',
    sm: 'btn-sm min-h-0 h-7 w-7 min-w-0',
    md: 'btn-md min-h-0 h-8 w-8 min-w-0',
  };

  const iconSizes = {
    xs: 'size-3',
    sm: 'size-3.5',
    md: 'size-4',
  };

  const previewLabel = `Preview ${sound} sound`;
  const stopLabel = 'Stop sound preview';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-pressed={isPlaying}
      aria-label={isPlaying ? stopLabel : previewLabel}
      title={isPlaying ? stopLabel : previewLabel}
      className={`btn btn-circle btn-ghost btn-primary ${sizeClasses[size]} p-0`}
    >
      {isPlaying ? (
        <PlayingAnimation className={iconSizes[size]} />
      ) : (
        <PlayIcon className={iconSizes[size]} />
      )}
    </button>
  );
};
