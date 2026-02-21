import type { NotificationSound } from '../../common/types';

/**
 * Interface for the sound service that handles audio playback.
 */
export interface ISoundService {
  /**
   * Plays a notification sound.
   * @param sound - The sound type to play ('ping', 'bell', or 'off')
   */
  playNotificationSound(sound?: NotificationSound): Promise<void>;

  /**
   * Ensures the offscreen document is ready for audio playback.
   */
  ensureOffscreenDocument(): Promise<void>;

  /**
   * Initializes the sound service.
   */
  initialize(): Promise<void>;

  /**
   * Disposes the sound service.
   */
  dispose(): Promise<void>;
}
