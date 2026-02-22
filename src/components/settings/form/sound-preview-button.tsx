import { useState, useCallback, useRef, useEffect } from 'react';
import type { NotificationSound } from '../../../../extension/common/types';
import { isPlayableSound } from '../../../../extension/common/sound-config';
import { chromeExtensionService } from '../../../services/chrome-extension-service';

interface SoundPreviewButtonProps {
  /** The sound to preview */
  sound: NotificationSound;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Optional size variant */
  size?: 'xs' | 'sm' | 'md';
}

/**
 * Play icon for the preview button
 */
function PlayIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path
        fillRule="evenodd"
        d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/**
 * Sound wave animation icon for playing state
 */
function PlayingAnimation({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <rect x="4" y="8" width="2" height="8" rx="1" className="animate-pulse">
        <animate attributeName="height" values="8;4;8" dur="0.6s" repeatCount="indefinite" />
        <animate attributeName="y" values="8;10;8" dur="0.6s" repeatCount="indefinite" />
      </rect>
      <rect x="9" y="6" width="2" height="12" rx="1" className="animate-pulse">
        <animate attributeName="height" values="12;6;12" dur="0.8s" repeatCount="indefinite" />
        <animate attributeName="y" values="6;9;6" dur="0.8s" repeatCount="indefinite" />
      </rect>
      <rect x="14" y="4" width="2" height="16" rx="1" className="animate-pulse">
        <animate attributeName="height" values="16;8;16" dur="0.7s" repeatCount="indefinite" />
        <animate attributeName="y" values="4;8;4" dur="0.7s" repeatCount="indefinite" />
      </rect>
      <rect x="19" y="8" width="2" height="8" rx="1" className="animate-pulse">
        <animate attributeName="height" values="8;4;8" dur="0.6s" repeatCount="indefinite" />
        <animate attributeName="y" values="8;10;8" dur="0.6s" repeatCount="indefinite" />
      </rect>
    </svg>
  );
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
