/**
 * Interface for the sound service that handles audio playback.
 */
export interface ISoundService {
  /**
   * Plays a notification sound.
   */
  playNotificationSound(soundFile?: string): Promise<void>;

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
