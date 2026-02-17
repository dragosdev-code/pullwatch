import type { PullRequest } from '../../common/types';

/**
 * Interface for the notification service that handles Chrome extension notifications.
 */
export interface INotificationService {
  /**
   * Shows notifications for new pull requests.
   */
  showNewPRNotifications(newPRs: PullRequest | PullRequest[], forceShow?: boolean): Promise<void>;

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
