import { PREVIEW_SOUND_ACTION } from '../../runtime-actions';
import type { NotificationSound } from '../../types';
import type { BackgroundActionClient } from './background-action-client';

/**
 * Sound-preview RPCs used by the settings sound picker. Playback runs in the offscreen audio
 * document; the background is the relay.
 */
export class SoundPreviewClient {
  constructor(private readonly bg: BackgroundActionClient) {}

  /** Plays a preview of `sound` ('ping', 'bell', 'off', or a custom sound id). */
  playPreview(sound: NotificationSound): Promise<void> {
    return this.bg.dispatch(PREVIEW_SOUND_ACTION.previewSound, { sound });
  }

  /** Stops any in-flight sound preview in the offscreen audio document. */
  stopPreview(): Promise<void> {
    return this.bg.dispatch(PREVIEW_SOUND_ACTION.stopPreviewSound, {});
  }
}
