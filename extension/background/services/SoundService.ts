import type { ISoundService } from '../interfaces/ISoundService';
import type { IDebugService } from '../interfaces/IDebugService';
import type { NotificationSound, CustomSoundMeta } from '../../common/types';
import {
  OFFSCREEN_DOCUMENT_PATH,
  OFFSCREEN_REASON_AUDIO_PLAYBACK,
  CUSTOM_SOUND_STORAGE_PREFIX,
  STORAGE_KEY_CUSTOM_SOUNDS_META,
} from '../../common/constants';
import { isCustomSoundId, resolvePlayableSoundOrFallback } from '../../common/sound-config';
import { EVENT_PLAY_SOUND, EVENT_STOP_SOUND_PLAYBACK } from '../../common/runtime-actions';
import {
  chromeExtensionService,
  ExtensionContextType,
  type ExtensionContext,
  type OffscreenReason,
} from '@common/chrome-extension-service';

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

  /**
   * Promise-chain “FIFO gate” so only one `playNotificationSound` talks to offscreen at a time.
   *
   * **Why this feels unfamiliar coming from UI code:** In React, one user gesture usually finishes
   * before the next starts from your perspective. In an extension **service worker**, multiple
   * `chrome.runtime.onMessage` handlers can be **in flight at once**—each hit `await` and yield,
   * so another message runs. Without this gate, two handlers could both `sendMessage(PLAY)` before
   * either offscreen play finished → overlapping audio. This is the same idea as a mutex/queue,
   * implemented with promises (no shared `locked` boolean, which races across `await`).
   *
   * **Mental model:** `playSoundGateTail` is “the promise the *next* caller must await.” Each
   * caller swaps in a fresh promise, awaits the *previous* tail, does work, then `resolve()`s so
   * the next waiter unblocks—like passing a baton down a line.
   */
  private playSoundGateTail: Promise<void> = Promise.resolve();

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
    if (!chromeExtensionService.offscreen.isAvailable() || !chromeExtensionService.runtime.hasGetContexts()) {
      this.debugService.warn(
        '[SoundService] offscreen or runtime.getContexts API is not available. Cannot check for offscreen document.'
      );
      return false;
    }
    try {
      const contexts: ExtensionContext[] = await chromeExtensionService.runtime.getContexts({
        contextTypes: [ExtensionContextType.OFFSCREEN_DOCUMENT],
        documentUrls: [chromeExtensionService.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)],
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
    if (!chromeExtensionService.offscreen.isAvailable()) {
      this.debugService.error(
        '[SoundService] offscreen API is not available. Cannot create offscreen document.'
      );
      return Promise.reject(new Error('Offscreen API not available.'));
    }

    if (this.creatingOffscreenDocument) {
      this.debugService.log(
        '[SoundService] Offscreen document creation already in progress. Waiting...'
      );
      return this.creatingOffscreenDocument;
    }

    this.creatingOffscreenDocument = this.doEnsureOffscreenDocument().finally(() => {
      this.creatingOffscreenDocument = null;
    });
    return this.creatingOffscreenDocument;
  }

  private async doEnsureOffscreenDocument(): Promise<void> {
    if (await this.hasOffscreenDocument()) {
      this.debugService.log('[SoundService] Offscreen document already exists.');
      return;
    }

    this.debugService.log('[SoundService] Creating offscreen document...');
    try {
      await chromeExtensionService.offscreen.createDocument({
        url: OFFSCREEN_DOCUMENT_PATH,
        reasons: [OFFSCREEN_REASON_AUDIO_PLAYBACK as OffscreenReason],
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
    const result = await chromeExtensionService.storage.local.get(storageKey);
    const customSoundBase64 = result[storageKey] as string | undefined;
    // WHY: Meta can still reference a slot after WAV was removed or failed to sync; sending
    // an empty custom payload only makes offscreen warn and fall back to ping—normalize here.
    if (!customSoundBase64) {
      return { soundType: 'ping' };
    }
    return { soundType: sound, customSoundBase64 };
  }

  private async loadCustomSoundsMeta(): Promise<CustomSoundMeta[]> {
    const result = await chromeExtensionService.storage.local.get(STORAGE_KEY_CUSTOM_SOUNDS_META);
    return (result[STORAGE_KEY_CUSTOM_SOUNDS_META] as CustomSoundMeta[] | undefined) ?? [];
  }

  /**
   * Plays a notification sound based on the sound type.
   * Awaits until the offscreen document confirms playback is complete,
   * keeping the service worker alive for the full sound duration.
   *
   * Wrapped in the promise gate above so concurrent callers are serialized (FIFO).
   */
  async playNotificationSound(sound: NotificationSound = 'ping'): Promise<void> {
    // 1) Remember who was in front of us in line (every prior play chained to this promise).
    const waitPrev = this.playSoundGateTail;

    // 2) Immediately publish a *new* tail and keep its resolver—we will call it when *we* finish
    //    so the next caller’s `await waitPrev` unblocks. (This part runs synchronously, before any
    //    await—important so two callers can’t both think the queue is empty.)
    let unlockGate!: () => void;
    this.playSoundGateTail = new Promise<void>((resolve) => {
      unlockGate = resolve;
    });

    // 3) Wait until everyone ahead of us has run their `finally { unlockGate() }`.
    await waitPrev;

    try {
      await this.doPlayNotificationSound(sound);
    } finally {
      // 4) Always wake the next waiter—same idea as `finally` in try/fetch so loading spinners clear.
      //    If we skipped this (e.g. only on success), one failure would freeze all later sounds forever.
      unlockGate();
    }
  }

  private async doPlayNotificationSound(sound: NotificationSound): Promise<void> {
    try {
      if (sound === 'off') {
        this.debugService.log('[SoundService] Sound is disabled (off), skipping playback');
        return;
      }

      this.debugService.log(`[SoundService] Playing notification sound: ${sound}`);

      await this.ensureOffscreenDocument();

      const metas = await this.loadCustomSoundsMeta();
      const resolved = resolvePlayableSoundOrFallback(sound, metas);
      if (resolved !== sound) {
        this.debugService.log(
          `[SoundService] Resolved missing custom slot ${sound} to ${resolved} for playback`
        );
      }

      const payload = await this.buildPlaySoundPayload(resolved);

      try {
        const response = await chromeExtensionService.runtime.sendMessage({
          action: EVENT_PLAY_SOUND,
          payload,
        });
        this.debugService.log('[SoundService] Sound playback completed, response:', response);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.debugService.error(
          '[SoundService] Error sending play sound message to offscreen:',
          message
        );
        throw new Error(message);
      }
    } catch (error) {
      this.debugService.error('[SoundService] Error playing notification sound:', error);
      // Don't re-throw: sound failure should not break the notification flow
    }
  }

  /**
   * Tells the offscreen document to suspend audio and end the current play wait.
   * No-op if the offscreen document is not open.
   */
  async stopNotificationPlayback(): Promise<void> {
    try {
      // WHY not behind `playSoundGateTail`: stop must preempt immediately; queuing after a long play would block preview UX.
      if (!(await this.hasOffscreenDocument())) {
        return;
      }
      try {
        await chromeExtensionService.runtime.sendMessage({
          action: EVENT_STOP_SOUND_PLAYBACK,
          payload: {},
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.debugService.warn('[SoundService] stop playback message:', message);
      }
    } catch (error) {
      this.debugService.error('[SoundService] Error stopping notification playback:', error);
    }
  }

  /**
   * Closes the offscreen document if it exists.
   */
  async closeOffscreenDocument(): Promise<void> {
    if (!chromeExtensionService.offscreen.isAvailable()) {
      this.debugService.warn(
        '[SoundService] offscreen.closeDocument API is not available. Cannot close offscreen document.'
      );
      return;
    }
    if (await this.hasOffscreenDocument()) {
      try {
        this.debugService.log('[SoundService] Closing offscreen document...');
        await chromeExtensionService.offscreen.closeDocument();
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
