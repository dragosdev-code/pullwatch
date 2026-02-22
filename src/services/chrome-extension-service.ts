import type { PullRequest, ExtensionSettings, NotificationSound } from '../../extension/common/types';

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
  private sendMessage<T>(action: string, payload?: unknown): Promise<T> {
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
    return this.sendMessage<PullRequest[]>('getAssignedPRs');
  }

  /**
   * Gets stored merged PRs from the background script.
   */
  async getStoredMergedPRs(): Promise<PullRequest[]> {
    return this.sendMessage<PullRequest[]>('getMergedPRs');
  }

  /**
   * Gets stored authored PRs from the background script.
   */
  async getStoredAuthoredPRs(): Promise<PullRequest[]> {
    return this.sendMessage<PullRequest[]>('getAuthoredPRs');
  }

  /**
   * Fetches fresh assigned/review PRs from GitHub via the background script.
   * This forces a network request to GitHub.
   */
  async fetchFreshAssignedPRs(): Promise<PullRequest[]> {
    return this.sendMessage<PullRequest[]>('fetchAssignedPRs');
  }

  /**
   * Fetches fresh merged PRs from GitHub via the background script.
   */
  async fetchFreshMergedPRs(): Promise<PullRequest[]> {
    return this.sendMessage<PullRequest[]>('fetchMergedPRs');
  }

  /**
   * Fetches fresh authored PRs from GitHub via the background script.
   */
  async fetchFreshAuthoredPRs(): Promise<PullRequest[]> {
    return this.sendMessage<PullRequest[]>('fetchAuthoredPRs');
  }

  /**
   * Gets extension settings from Chrome storage (sync).
   */
  async getSettings(): Promise<ExtensionSettings> {
    return this.sendMessage<ExtensionSettings>('getSettings');
  }

  /**
   * Saves extension settings to Chrome storage (sync).
   * Returns the complete updated settings.
   */
  async saveSettings(settings: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
    return this.sendMessage<ExtensionSettings>('saveSettings', settings);
  }

  /**
   * Sends a test notification.
   */
  async sendTestNotification(): Promise<void> {
    return this.sendMessage('testNotification');
  }

  /**
   * Plays a sound preview for the specified notification sound type.
   * Used in settings to let users test sounds before selecting.
   * @param sound - The sound type to preview ('ping', 'bell', or 'off')
   */
  async playSoundPreview(sound: NotificationSound): Promise<void> {
    return this.sendMessage('previewSound', { sound });
  }

  /**
   * Sets up a listener for background script messages.
   */
  onMessage(callback: (message: { action: string; data?: unknown }) => void): () => void {
    if (!this.isExtensionContext()) {
      return () => {}; // Return empty cleanup function
    }

    const messageListener = (message: { action: string; data?: unknown }) => {
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
      return () => {}; // Return empty cleanup function
    }

    const messageListener = (message: { action: string; data?: unknown }) => {
      if (message.action === 'settingsUpdated' && message.data) {
        callback(message.data as ExtensionSettings);
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    // Return cleanup function
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }
}

// Export singleton instance
export const chromeExtensionService = new ChromeExtensionService();
