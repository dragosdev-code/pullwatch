import type { PullRequest } from '../../common/types';
import type { IService } from './IService';

/**
 * Interface for the notification service that handles Chrome extension notifications.
 * Supports category-specific notifications for assigned and merged PRs.
 */
export interface INotificationService extends IService {
  /**
   * Shows notifications for new assigned pull requests.
   * Respects assigned notification settings including draft filtering.
   * @param newPRs - Array of new pull requests to notify about
   */
  showAssignedPRNotifications(
    newPRs: PullRequest | PullRequest[]
  ): Promise<void>;

  /**
   * Shows notifications for merged pull requests.
   * Respects merged notification settings.
   * @param mergedPRs - Array of merged pull requests to notify about
   */
  showMergedPRNotifications(mergedPRs: PullRequest | PullRequest[]): Promise<void>;

  /**
   * Fires a sample notification + sound from settings (To Review vs Merged).
   * Uses non-`pr-alert` IDs so clicks dismiss without opening a tab.
   * On failure throws `Error` whose message is `SETTINGS_TEST_ERROR_COOLDOWN` or `SETTINGS_TEST_ERROR_DISABLED`.
   */
  fireSettingsTestNotification(category: 'assigned' | 'merged'): Promise<void>;

  /**
   * Handles notification clicks.
   */
  handleNotificationClick(notificationId: string): Promise<void>;

  /**
   * Creates a custom notification.
   * @param options - Chrome notification options
   * @param notificationId - Optional explicit ID (recommended for dedup and macOS compatibility)
   */
  createNotification(
    options: chrome.notifications.NotificationCreateOptions,
    notificationId?: string
  ): Promise<void>;

  /**
   * Clears a notification by ID.
   */
  clearNotification(notificationId: string): Promise<void>;

  /**
   * Clears all notifications.
   */
  clearAllNotifications(): Promise<void>;

  /**
   * Gets all active notifications.
   */
  getAllNotifications(): Promise<string[]>;
}
