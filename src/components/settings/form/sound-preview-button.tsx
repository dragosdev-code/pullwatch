import { useState, useCallback, useRef, useEffect } from 'react';
import type { NotificationSound } from '../../../../extension/common/types';
import { isPlayableSound } from '../../../../extension/common/sound-config';
import { chromeExtensionService } from '../../../services/chrome-extension-service';
import { PlayIcon, PlayingAnimation } from '../../ui/icons';

interface SoundPreviewButtonProps {
  /** The sound to preview */
  sound: NotificationSound;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Optional size variant */
  size?: 'xs' | 'sm' | 'md';
}

/**
 * Inline sound preview button.
 * Allows quick testing of a sound without opening the full picker modal.
 */
export function SoundPreviewButton({
  sound,
  disabled = false,
  size = 'sm',
}: SoundPreviewButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const playTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (playTimeoutRef.current) {
        clearTimeout(playTimeoutRef.current);
      }
    };
  }, []);

  /**
   * Handle play button click
   */
  const handlePlay = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (!isPlayableSound(sound) || isPlaying || disabled) {
        return;
      }

      setIsPlaying(true);

      // Clear any existing timeout
      if (playTimeoutRef.current) {
        clearTimeout(playTimeoutRef.current);
      }

      try {
        await chromeExtensionService.playSoundPreview(sound);
      } catch (error) {
        console.error('[SoundPreviewButton] Failed to play sound:', error);
      }

      // Reset playing state after sound duration
      playTimeoutRef.current = setTimeout(() => {
        setIsPlaying(false);
      }, 1000);
    },
    [sound, isPlaying, disabled, setIsPlaying]
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

  return (
    <button
      type="button"
      onClick={handlePlay}
      disabled={disabled}
      className={`btn btn-circle btn-ghost btn-primary ${sizeClasses[size]} p-0`}
      aria-label={`Preview ${sound} sound`}
      title={`Preview ${sound} sound`}
    >
      {isPlaying ? (
        <PlayingAnimation className={iconSizes[size]} />
      ) : (
        <PlayIcon className={iconSizes[size]} />
      )}
    </button>
  );
}
