import { useState, useCallback, useRef, useEffect, useId } from 'react';
import { animated, useTransition } from '@react-spring/web';
import type { NotificationSound } from '@common/types';
import { isPlayableSound } from '@common/sound-config';
import { chromeExtensionService } from '@common/chrome-extension-service';
import {
  claimPreviewSession,
  getActivePreviewSessionId,
  releasePreviewSession,
  subscribePreviewSession,
} from '@src/services/sound-preview-session';
import { usePrefersReducedMotion } from '@src/hooks/use-prefers-reduced-motion';
import { SETTINGS_SPRING_SNAPPY } from '../settings/shared/animation/settings-motion';
import { PlayIcon, PlayingAnimation } from '../ui/icons';

interface SoundPreviewButtonProps {
  /** The sound to preview */
  sound: NotificationSound;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Optional size variant */
  size?: 'xs' | 'sm' | 'md';
  /**
   * Increment when preview should be reset from outside (e.g. row delete) so the playing UI clears.
   */
  playbackInterruptKey?: number;
}

/**
 * Inline sound preview button.
 *
 * **Wave timing:** `playSoundPreview` resolves only after offscreen finishes (decode + playback).
 * The wave is shown for that whole await. Custom WAVs decode in the offscreen document first, so
 * you may see the wave briefly before you hear audio—that gap is normal; we do not add extra UI
 * time after the sound ends (the old `playbackDurationMs` tail was wrong once the API awaited completion).
 */
export const SoundPreviewButton = ({
  sound,
  disabled = false,
  size = 'sm',
  playbackInterruptKey = 0,
}: SoundPreviewButtonProps) => {
  // WHY useId: stable per mount so session ownership is unique even when two rows preview the same sound id (e.g. field + modal).
  const clientId = useId();
  const [isPlaying, setIsPlaying] = useState(false);
  const prevInterruptKeyRef = useRef(playbackInterruptKey);
  /** When true, ignore post-await cleanup (user stopped or parent interrupted while preview was in flight). */
  const discardPlayCompletionRef = useRef(false);

  const resetLocalPreviewUi = useCallback(() => {
    discardPlayCompletionRef.current = true;
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
        void chromeExtensionService.sound.stopPreview();
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

      try {
        await chromeExtensionService.sound.playPreview(sound);
      } catch (error) {
        console.error('[SoundPreviewButton] Failed to play sound:', error);
        releasePreviewSession(clientId);
        setIsPlaying(false);
        return;
      }

      // WHY discard / active-id: user may have stopped or another button claimed while `playSoundPreview` was resolving.
      if (discardPlayCompletionRef.current || getActivePreviewSessionId() !== clientId) {
        return;
      }

      // WHY no extra timeout: `playSoundPreview` already waits until offscreen playback ends; a follow-up delay only kept the wave on after audio stopped.
      setIsPlaying(false);
      releasePreviewSession(clientId);
    },
    [sound, isPlaying, disabled, clientId]
  );

  const prefersReducedMotion = usePrefersReducedMotion();

  const iconTransitions = useTransition(isPlaying, {
    from: { opacity: 0, scale: 0.8 },
    enter: { opacity: 1, scale: 1 },
    leave: { opacity: 0, scale: 0.8 },
    config: SETTINGS_SPRING_SNAPPY,
    immediate: prefersReducedMotion,
  });

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

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={`btn btn-circle btn-ghost btn-primary ${sizeClasses[size]} p-0 relative transition-transform duration-90 active:scale-90`}
    >
      {iconTransitions((style, playing) => (
        <animated.span
          style={{
            ...style,
            transform: style.scale.to((s) => `scale(${s})`),
            position: 'absolute',
            inset: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-hidden
        >
          {playing ? (
            <PlayingAnimation className={iconSizes[size]} />
          ) : (
            <PlayIcon className={iconSizes[size]} />
          )}
        </animated.span>
      ))}
    </button>
  );
};
