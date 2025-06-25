/**
 * Interface for the sound service that handles audio playback.
 */
export interface ISoundService {
  /**
   * Plays a notification sound.
   */
  playNotificationSound(soundFile?: string): Promise<void>;

  /**
   * Plays a custom sound.
   */
  playSound(soundFile: string, volume?: number): Promise<void>;

  /**
   * Stops all currently playing sounds.
   */
  stopAllSounds(): Promise<void>;

  /**
   * Checks if sound is enabled.
   */
  isSoundEnabled(): Promise<boolean>;

  /**
   * Enables or disables sound.
   */
  setSoundEnabled(enabled: boolean): Promise<void>;

  /**
   * Sets the master volume.
   */
  setVolume(volume: number): Promise<void>;

  /**
   * Gets the current volume.
   */
  getVolume(): Promise<number>;

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
