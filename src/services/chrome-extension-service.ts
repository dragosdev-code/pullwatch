import type {
  PullRequest,
  ExtensionSettings,
  NotificationSound,
  DevTestNotificationOverrides,
  DevTestLooperState,
  DevTestAlarmOverrideState,
  ScraperUrl,
  RuntimeMessage,
} from '../../extension/common/types';
import {
  DEV_TEST_ACTION,
  EVENT_SETTINGS_UPDATED,
  PR_DATA_ACTION,
  PREVIEW_SOUND_ACTION,
  SETTINGS_ACTION,
  type RequestRuntimeAction,
} from '../../extension/common/runtime-actions';

/**
 * Service to handle Chrome extension communication.
 * Provides promise-based API for background script communication.
 */
export class ChromeExtensionService {
  /**
   * Checks if we're running in a Chrome extension context.
   */
  private isExtensionContext(): boolean {
    return (
      typeof chrome !== 'undefined' &&
      chrome.runtime &&
      typeof chrome.runtime.sendMessage === 'function'
    );
  }

  /**
   * Sends a message to the background script and returns a promise.
   */
  private sendMessage<T>(action: RequestRuntimeAction, payload?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.isExtensionContext()) {
        reject(new Error('Extension context not available'));
        return;
      }

      chrome.runtime.sendMessage(
        { action, payload },
        (response: { success: boolean; data?: T; error?: string }) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          if (response && response.success) {
            resolve(response.data as T);
          } else {
            reject(new Error(response?.error || `Failed to execute action: ${action}`));
          }
        }
      );
    });
  }

  /**
   * Gets stored assigned/review PRs from the background script.
   * This returns immediately with cached data.
   */
  async getStoredAssignedPRs(): Promise<PullRequest[]> {
    return this.sendMessage<PullRequest[]>(PR_DATA_ACTION.getAssignedPRs);
  }

  /**
   * Gets stored merged PRs from the background script.
   */
  async getStoredMergedPRs(): Promise<PullRequest[]> {
    return this.sendMessage<PullRequest[]>(PR_DATA_ACTION.getMergedPRs);
  }

  /**
   * Gets stored authored PRs from the background script.
   */
  async getStoredAuthoredPRs(): Promise<PullRequest[]> {
    return this.sendMessage<PullRequest[]>(PR_DATA_ACTION.getAuthoredPRs);
  }

  /**
   * Fetches fresh assigned/review PRs from GitHub via the background script.
   * This forces a network request to GitHub.
   */
  async fetchFreshAssignedPRs(): Promise<PullRequest[]> {
    return this.sendMessage<PullRequest[]>(PR_DATA_ACTION.fetchAssignedPRs);
  }

  /**
   * Fetches fresh merged PRs from GitHub via the background script.
   */
  async fetchFreshMergedPRs(): Promise<PullRequest[]> {
    return this.sendMessage<PullRequest[]>(PR_DATA_ACTION.fetchMergedPRs);
  }

  /**
   * Fetches fresh authored PRs from GitHub via the background script.
   */
  async fetchFreshAuthoredPRs(): Promise<PullRequest[]> {
    return this.sendMessage<PullRequest[]>(PR_DATA_ACTION.fetchAuthoredPRs);
  }

  /**
   * Gets extension settings from Chrome storage (sync).
   */
  async getSettings(): Promise<ExtensionSettings> {
    return this.sendMessage<ExtensionSettings>(SETTINGS_ACTION.getSettings);
  }

  /**
   * Saves extension settings to Chrome storage (sync).
   * Returns the complete updated settings.
   */
  async saveSettings(settings: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
    return this.sendMessage<ExtensionSettings>(SETTINGS_ACTION.saveSettings, settings);
  }

  /**
   * Fires a sample system notification and the saved sound for To Review (`assigned`) or Merged.
   */
  async testSettingsNotification(category: 'assigned' | 'merged'): Promise<void> {
    return this.sendMessage(SETTINGS_ACTION.testSettingsNotification, { category });
  }

  /**
   * Plays a sound preview for the specified notification sound type.
   * Used in settings to let users test sounds before selecting.
   * @param sound - The sound type to preview ('ping', 'bell', or 'off')
   */
  async playSoundPreview(sound: NotificationSound): Promise<void> {
    return this.sendMessage(PREVIEW_SOUND_ACTION.previewSound, { sound });
  }

  /**
   * Stops any in-flight sound preview in the offscreen audio document.
   */
  async stopSoundPreview(): Promise<void> {
    return this.sendMessage(PREVIEW_SOUND_ACTION.stopPreviewSound, {});
  }

  /**
   * Sets up a listener for background script messages.
   */
  onMessage(callback: (message: RuntimeMessage) => void): () => void {
    if (!this.isExtensionContext()) {
      return () => {}; // Return empty cleanup function
    }

    const messageListener = (message: RuntimeMessage) => {
      callback(message);
    };

    chrome.runtime.onMessage.addListener(messageListener);

    // Return cleanup function
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }

  /**
   * Sets up a listener specifically for settings changes.
   * This listens for updates from other contexts (background, other tabs).
   */
  onSettingsChange(callback: (settings: ExtensionSettings) => void): () => void {
    if (!this.isExtensionContext()) {
      return () => {};
    }

    const messageListener = (message: RuntimeMessage) => {
      if (message.action === EVENT_SETTINGS_UPDATED && 'data' in message && message.data) {
        callback(message.data as ExtensionSettings);
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }

  // ─── Dev Test Area ─────────────────────────────────────────────────────

  async devTestFireNotification(overrides?: DevTestNotificationOverrides): Promise<void> {
    return this.sendMessage(DEV_TEST_ACTION.fireNotification, overrides);
  }

  async devTestStartLoop(intervalMs: number): Promise<DevTestLooperState> {
    return this.sendMessage<DevTestLooperState>(DEV_TEST_ACTION.startLoop, { intervalMs });
  }

  async devTestStopLoop(): Promise<DevTestLooperState> {
    return this.sendMessage<DevTestLooperState>(DEV_TEST_ACTION.stopLoop);
  }

  async devTestGetLooperState(): Promise<DevTestLooperState> {
    return this.sendMessage<DevTestLooperState>(DEV_TEST_ACTION.getLooperState);
  }

  async devTestOverrideAlarm(intervalMs: number): Promise<DevTestAlarmOverrideState> {
    return this.sendMessage<DevTestAlarmOverrideState>(DEV_TEST_ACTION.overrideAlarm, { intervalMs });
  }

  async devTestRestoreAlarm(): Promise<DevTestAlarmOverrideState> {
    return this.sendMessage<DevTestAlarmOverrideState>(DEV_TEST_ACTION.restoreAlarm);
  }

  async devTestGetAlarmState(): Promise<DevTestAlarmOverrideState> {
    return this.sendMessage<DevTestAlarmOverrideState>(DEV_TEST_ACTION.getAlarmState);
  }

  async devTestGetScraperUrls(): Promise<ScraperUrl[]> {
    return this.sendMessage<ScraperUrl[]>(DEV_TEST_ACTION.getScraperUrls);
  }
}

// Export singleton instance
export const chromeExtensionService = new ChromeExtensionService();
