import type { ISoundService } from '../interfaces/ISoundService';
import type { IDebugService } from '../interfaces/IDebugService';
import {
  OFFSCREEN_DOCUMENT_PATH,
  OFFSCREEN_REASON_AUDIO_PLAYBACK,
  EVENT_PLAY_SOUND,
} from '../../common/constants';

/**
 * SoundService handles audio playback through offscreen documents.
 * Manages offscreen document lifecycle and audio playback for notifications.
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
   */
  async ensureOffscreenDocument(): Promise<void> {
    if (!chrome.offscreen) {
      this.debugService.error(
        '[SoundService] chrome.offscreen API is not available. Cannot create offscreen document.'
      );
      return Promise.reject(new Error('Offscreen API not available.'));
    }

    // Check without creating a new promise if not necessary
    if (await this.hasOffscreenDocument()) {
      this.debugService.log('[SoundService] Offscreen document already exists.');
      return Promise.resolve();
    }

    if (this.creatingOffscreenDocument) {
      this.debugService.log(
        '[SoundService] Offscreen document creation already in progress. Waiting...'
      );
      return this.creatingOffscreenDocument;
    }

    this.debugService.log('[SoundService] Creating offscreen document...');
    this.creatingOffscreenDocument = (async () => {
      try {
        await chrome.offscreen.createDocument({
          url: OFFSCREEN_DOCUMENT_PATH, // Path relative to the extension's root
          reasons: [OFFSCREEN_REASON_AUDIO_PLAYBACK as chrome.offscreen.Reason],
          justification: 'Playing notification sounds for new PRs',
        });
        this.debugService.log('[SoundService] Offscreen document created successfully.');
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.debugService.error('[SoundService] Error creating offscreen document:', errorMessage);
        if (errorMessage.includes('Only a single offscreen document may be created')) {
          this.debugService.warn(
            '[SoundService] Attempted to create an offscreen document when one likely already exists or was being created.'
          );
          // Document might exist now due to a race condition, try checking again.
          if (!(await this.hasOffscreenDocument())) {
            // If it truly doesn't exist after the error, then it's a problem.
            throw new Error(
              'Failed to create offscreen document, and it does not exist after error.'
            );
          }
        } else {
          throw error; // Re-throw other errors
        }
      } finally {
        this.creatingOffscreenDocument = null; // Clear the creation lock
      }
    })();

    return this.creatingOffscreenDocument;
  }

  /**
   * Plays a notification sound.
   */
  async playNotificationSound(soundFile = 'notification.mp3'): Promise<void> {
    try {
      this.debugService.log(`[SoundService] Playing notification sound: ${soundFile}`);
      await this.ensureOffscreenDocument();

      // Send message to the offscreen document for audio playback
      chrome.runtime.sendMessage(
        { action: EVENT_PLAY_SOUND, payload: { sound: soundFile } },
        (response) => {
          if (chrome.runtime.lastError) {
            this.debugService.error(
              '[SoundService] Error sending play sound message to offscreen:',
              chrome.runtime.lastError.message
            );
          } else {
            this.debugService.log(
              '[SoundService] Play sound message sent to offscreen, response:',
              response
            );
          }
        }
      );
    } catch (error) {
      this.debugService.error('[SoundService] Error playing notification sound:', error);
      throw error;
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
