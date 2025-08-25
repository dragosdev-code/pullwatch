import type { PullRequest } from '../../extension/common/types';

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
   * Gets stored PRs from the background script.
   * This returns immediately with cached data.
   */
  async getStoredPRs(): Promise<PullRequest[]> {
    return this.sendMessage<PullRequest[]>('getPRs');
  }

  /**
   * Gets stored merged PRs from the background script.
   */
  async getStoredMergedPRs(): Promise<PullRequest[]> {
    return this.sendMessage<PullRequest[]>('getMergedPRs');
  }

  /**
   * Fetches fresh PRs from GitHub via the background script.
   * This forces a network request to GitHub.
   */
  async fetchFreshPRs(): Promise<PullRequest[]> {
    return this.sendMessage<PullRequest[]>('fetchPRs');
  }

  /**
   * Fetches fresh merged PRs from GitHub via the background script.
   */
  async fetchFreshMergedPRs(): Promise<PullRequest[]> {
    return this.sendMessage<PullRequest[]>('fetchMergedPRs');
  }

  /**
   * Sends a test notification.
   */
  async sendTestNotification(): Promise<void> {
    return this.sendMessage('testNotification');
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
}

// Export singleton instance
export const chromeExtensionService = new ChromeExtensionService();
