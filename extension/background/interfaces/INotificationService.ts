import type { PullRequest } from '../../common/types';

/**
 * Options for showing assigned PR notifications
 */
export interface AssignedNotificationOptions {
  /** Whether to include draft PRs in notifications */
  includeDrafts: boolean;
}

/**
 * Interface for the notification service that handles Chrome extension notifications.
 * Supports category-specific notifications for assigned and merged PRs.
 */
export interface INotificationService {
  /**
   * Shows notifications for new assigned pull requests.
   * Respects assigned notification settings including draft filtering.
   * @param newPRs - Array of new pull requests to notify about
   * @param options - Options for filtering and display
   */
  showAssignedPRNotifications(
    newPRs: PullRequest | PullRequest[],
    options: AssignedNotificationOptions
  ): Promise<void>;

  /**
   * Shows notifications for merged pull requests.
   * Respects merged notification settings.
   * @param mergedPRs - Array of merged pull requests to notify about
   */
  showMergedPRNotifications(mergedPRs: PullRequest | PullRequest[]): Promise<void>;

  /**
   * Handles notification clicks.
   */
  handleNotificationClick(notificationId: string): Promise<void>;

  /**
   * Creates a custom notification.
   */
  createNotification(options: chrome.notifications.NotificationCreateOptions): Promise<void>;

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

  /**
   * Initializes the notification service.
   */
  initialize(): Promise<void>;

  /**
   * Disposes the notification service.
   */
  dispose(): Promise<void>;
}
