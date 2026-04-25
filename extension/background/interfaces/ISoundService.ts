import type { NotificationSound } from '@common/types';
import type { IService } from './IService';

/**
 * Interface for the sound service that handles audio playback.
 */
export interface ISoundService extends IService {
  /**
   * Plays a notification sound via the offscreen audio document.
   * @param sound - Built-in (`ping`, `bell`), a user slot (`custom_0`, …), or `off` to skip playback. Defaults to `ping`.
   */
  playNotificationSound(sound?: NotificationSound): Promise<void>;

  /**
   * Stops any in-flight offscreen playback (preview or notification tail wait).
   */
  stopNotificationPlayback(): Promise<void>;

  /**
   * Ensures the offscreen document is ready for audio playback.
   */
  ensureOffscreenDocument(): Promise<void>;
}
