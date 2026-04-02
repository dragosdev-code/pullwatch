import type { ISoundService } from '../interfaces/ISoundService';
import type { IDebugService } from '../interfaces/IDebugService';
import type { NotificationSound } from '../../common/types';
import {
  OFFSCREEN_DOCUMENT_PATH,
  OFFSCREEN_REASON_AUDIO_PLAYBACK,
  CUSTOM_SOUND_STORAGE_PREFIX,
} from '../../common/constants';
import { isCustomSoundId } from '../../common/sound-config';
import { EVENT_PLAY_SOUND } from '../../common/runtime-actions';

type PlaySoundPayload = {
  soundType: NotificationSound;
  customSoundBase64?: string;
};

/**
 * SoundService handles audio playback through offscreen documents.
 * Manages offscreen document lifecycle and audio playback for notifications.
 * Supports multiple sound types: 'ping', 'bell', and 'off'.
 */
export class SoundService implements ISoundService {
  private debugService: IDebugService;
  private initialized = false;
  private creatingOffscreenDocument: Promise<void> | null = null;

  constructor(debugService: IDebugService) {
    this.debugService = debugService;
  }

  /**
   * Initializes the sound service.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.initialized = true;
    this.debugService.log('[SoundService] Sound service initialized');
  }

  /**
   * Checks if an offscreen document with the specified path already exists.
   */
  private async hasOffscreenDocument(): Promise<boolean> {
    if (!chrome.offscreen || !chrome.runtime.getContexts) {
      this.debugService.warn(
        '[SoundService] chrome.offscreen or chrome.runtime.getContexts API is not available. Cannot check for offscreen document.'
      );
      return false;
    }
    try {
      const contexts: chrome.runtime.ExtensionContext[] = await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
        documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)],
      });
      return contexts && contexts.length > 0;
    } catch (error) {
      this.debugService.error(
        '[SoundService] Error checking for existing offscreen document:',
        error
      );
      return false; // Assume not present if an error occurs during check
    }
  }

  /**
   * Ensures the offscreen document is ready for audio playback.
   * Lock is acquired synchronously before any async work to prevent TOCTOU races.
   */
  async ensureOffscreenDocument(): Promise<void> {
    if (!chrome.offscreen) {
      this.debugService.error(
        '[SoundService] chrome.offscreen API is not available. Cannot create offscreen document.'
      );
      return Promise.reject(new Error('Offscreen API not available.'));
    }

    if (this.creatingOffscreenDocument) {
      this.debugService.log(
        '[SoundService] Offscreen document creation already in progress. Waiting...'
      );
      return this.creatingOffscreenDocument;
    }

    this.creatingOffscreenDocument = this.doEnsureOffscreenDocument()
      .finally(() => { this.creatingOffscreenDocument = null; });
    return this.creatingOffscreenDocument;
  }

  private async doEnsureOffscreenDocument(): Promise<void> {
    if (await this.hasOffscreenDocument()) {
      this.debugService.log('[SoundService] Offscreen document already exists.');
      return;
    }

    this.debugService.log('[SoundService] Creating offscreen document...');
    try {
      await chrome.offscreen.createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: [OFFSCREEN_REASON_AUDIO_PLAYBACK as chrome.offscreen.Reason],
        justification: 'Playing notification sounds for new PRs',
      });
      this.debugService.log('[SoundService] Offscreen document created successfully.');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.debugService.error('[SoundService] Error creating offscreen document:', errorMessage);
      if (errorMessage.includes('Only a single offscreen document may be created')) {
        this.debugService.warn(
          '[SoundService] Offscreen document already exists (concurrent creation detected).'
        );
        if (!(await this.hasOffscreenDocument())) {
          throw new Error(
            'Failed to create offscreen document, and it does not exist after error.'
          );
        }
      } else {
        throw error;
      }
    }
  }

  /**
   * Builds the play-sound payload. Custom sounds are read from chrome.storage.local here
   * because offscreen documents do not have access to the chrome.storage API.
   */
  private async buildPlaySoundPayload(sound: NotificationSound): Promise<PlaySoundPayload> {
    if (!isCustomSoundId(sound)) {
      return { soundType: sound };
    }
    const slot = sound.replace(/^custom_/, '');
    const storageKey = `${CUSTOM_SOUND_STORAGE_PREFIX}${slot}`;
    const result = await chrome.storage.local.get(storageKey);
    const customSoundBase64 = result[storageKey] as string | undefined;
    return { soundType: sound, customSoundBase64 };
  }

  /**
   * Plays a notification sound based on the sound type.
   * Awaits until the offscreen document confirms playback is complete,
   * keeping the service worker alive for the full sound duration.
   */
  async playNotificationSound(sound: NotificationSound = 'ping'): Promise<void> {
    try {
      if (sound === 'off') {
        this.debugService.log('[SoundService] Sound is disabled (off), skipping playback');
        return;
      }

      this.debugService.log(`[SoundService] Playing notification sound: ${sound}`);

      await this.ensureOffscreenDocument();

      const payload = await this.buildPlaySoundPayload(sound);

      await new Promise<void>((resolve, reject) => {
        chrome.runtime.sendMessage(
          { action: EVENT_PLAY_SOUND, payload },
          (response) => {
            if (chrome.runtime.lastError) {
              this.debugService.error(
                '[SoundService] Error sending play sound message to offscreen:',
                chrome.runtime.lastError.message
              );
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              this.debugService.log(
                '[SoundService] Sound playback completed, response:',
                response
              );
              resolve();
            }
          }
        );
      });
    } catch (error) {
      this.debugService.error('[SoundService] Error playing notification sound:', error);
      // Don't re-throw: sound failure should not break the notification flow
    }
  }

  /**
   * Closes the offscreen document if it exists.
   */
  async closeOffscreenDocument(): Promise<void> {
    if (!chrome.offscreen || !chrome.offscreen.closeDocument) {
      this.debugService.warn(
        '[SoundService] chrome.offscreen.closeDocument API is not available. Cannot close offscreen document.'
      );
      return;
    }
    if (await this.hasOffscreenDocument()) {
      try {
        this.debugService.log('[SoundService] Closing offscreen document...');
        await chrome.offscreen.closeDocument();
        this.debugService.log('[SoundService] Offscreen document closed.');
      } catch (error) {
        this.debugService.error('[SoundService] Error closing offscreen document:', error);
      }
    } else {
      this.debugService.log('[SoundService] No active offscreen document to close.');
    }
  }

  /**
   * Disposes the sound service.
   */
  async dispose(): Promise<void> {
    try {
      await this.closeOffscreenDocument();
      this.debugService.log('[SoundService] Sound service disposed');
      this.initialized = false;
    } catch (error) {
      this.debugService.error('[SoundService] Error during disposal:', error);
    }
  }
}
