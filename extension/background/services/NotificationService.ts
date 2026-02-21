import type {
  INotificationService,
  AssignedNotificationOptions,
} from '../interfaces/INotificationService';
import type { IDebugService } from '../interfaces/IDebugService';
import type { IStorageService } from '../interfaces/IStorageService';
import type { ISoundService } from '../interfaces/ISoundService';
import type { PullRequest } from '../../common/types';

/**
 * NotificationService handles Chrome extension notifications with sound integration.
 * Manages category-specific notifications (assigned vs merged) with configurable settings.
 * Supports draft PR filtering and per-category sound selection.
 */
export class NotificationService implements INotificationService {
  private debugService: IDebugService;
  private storageService: IStorageService;
  private soundService: ISoundService;
  private initialized = false;

  constructor(deps: {
    debugService: IDebugService;
    storageService: IStorageService;
    soundService: ISoundService;
  }) {
    this.debugService = deps.debugService;
    this.storageService = deps.storageService;
    this.soundService = deps.soundService;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    this.debugService.log('[NotificationService] Notification service initialized');
  }

  /**
   * Shows notifications for new assigned pull requests.
   * Respects assigned notification settings including draft filtering.
   */
  async showAssignedPRNotifications(
    newPRs: PullRequest | PullRequest[],
    options: AssignedNotificationOptions
  ): Promise<void> {
    try {
      const settings = await this.storageService.getExtensionSettings();

      // Check if assigned notifications are enabled
      if (!settings.assigned.notificationsEnabled) {
        this.debugService.log(
          '[NotificationService] Assigned PR notifications disabled, skipping'
        );
        return;
      }

      // Normalize input to array
      const prsArray = Array.isArray(newPRs) ? newPRs : [newPRs];

      // Filter out drafts if notifyOnDrafts is false
      const filteredPRs = options.includeDrafts
        ? prsArray
        : prsArray.filter((pr) => pr.type !== 'draft');

      if (filteredPRs.length === 0) {
        this.debugService.log(
          '[NotificationService] All PRs are drafts and notifyOnDrafts is disabled, skipping'
        );
        return;
      }

      this.debugService.log(
        `[NotificationService] Showing assigned PR notifications for ${filteredPRs.length} PR(s)`
      );

      // Show visual notifications for each PR
      await this.showPRNotificationsInternal(filteredPRs, 'assigned');

      // Play sound based on assigned sound setting
      await this.playNotificationSoundForCategory(settings.assigned.sound, 'assigned');
    } catch (error) {
      this.debugService.error('[NotificationService] Error showing assigned PR notifications:', error);
      throw error;
    }
  }

  /**
   * Shows notifications for merged pull requests.
   * Respects merged notification settings.
   */
  async showMergedPRNotifications(mergedPRs: PullRequest | PullRequest[]): Promise<void> {
    try {
      const settings = await this.storageService.getExtensionSettings();

      // Check if merged notifications are enabled
      if (!settings.merged.notificationsEnabled) {
        this.debugService.log('[NotificationService] Merged PR notifications disabled, skipping');
        return;
      }

      // Normalize input to array
      const prsArray = Array.isArray(mergedPRs) ? mergedPRs : [mergedPRs];

      this.debugService.log(
        `[NotificationService] Showing merged PR notifications for ${prsArray.length} PR(s)`
      );

      // Show visual notifications for each PR with merged-specific title
      await this.showPRNotificationsInternal(prsArray, 'merged');

      // Play sound based on merged sound setting
      await this.playNotificationSoundForCategory(settings.merged.sound, 'merged');
    } catch (error) {
      this.debugService.error('[NotificationService] Error showing merged PR notifications:', error);
      throw error;
    }
  }

  /**
   * Internal method to show visual notifications for PRs.
   */
  private async showPRNotificationsInternal(
    prs: PullRequest[],
    category: 'assigned' | 'merged'
  ): Promise<void> {
    const isMerged = category === 'merged';

    for (const pr of prs) {
      const title = isMerged
        ? prs.length === 1
          ? 'PR Merged!'
          : `PR Merged! (${prs.indexOf(pr) + 1}/${prs.length})`
        : prs.length === 1
          ? 'New PR Review Request'
          : `New PR Review Request (${prs.indexOf(pr) + 1}/${prs.length})`;

      await this.createNotification({
        type: 'basic',
        iconUrl: 'https://github.com/favicon.ico',
        title,
        message: pr.title,
        contextMessage: `${pr.repoName} by ${pr.author.login}`,
        requireInteraction: false,
        silent: true,
        priority: 2,
      });

      this.debugService.log(`[NotificationService] Visual notification shown for: ${pr.title}`);
    }
  }

  /**
   * Plays notification sound for a specific category.
   */
  private async playNotificationSoundForCategory(
    sound: 'ping' | 'bell' | 'off',
    category: string
  ): Promise<void> {
    try {
      await this.soundService.playNotificationSound(sound);
      this.debugService.log(`[NotificationService] ${category} notification sound played: ${sound}`);
    } catch (soundError) {
      this.debugService.error(
        `[NotificationService] Error playing ${category} notification sound:`,
        soundError
      );
      // Don't fail the entire notification if sound fails
    }
  }

  async handleNotificationClick(notificationId: string): Promise<void> {
    try {
      this.debugService.log(`[NotificationService] Notification clicked: ${notificationId}`);

      // Clear the clicked notification
      await this.clearNotification(notificationId);

      // Could open the PR URL in a new tab here
      // chrome.tabs.create({ url: prUrl });
    } catch (error) {
      this.debugService.error('[NotificationService] Error handling notification click:', error);
    }
  }

  async createNotification(options: chrome.notifications.NotificationCreateOptions): Promise<void> {
    try {
      const notificationId = await chrome.notifications.create(options);
      this.debugService.log(
        `[NotificationService] Created notification: ${notificationId} - ${options.title}`
      );
    } catch (error) {
      this.debugService.error('[NotificationService] Error creating notification:', error);
      throw error;
    }
  }

  async clearNotification(notificationId: string): Promise<void> {
    try {
      await chrome.notifications.clear(notificationId);
      this.debugService.log(`[NotificationService] Cleared notification: ${notificationId}`);
    } catch (error) {
      this.debugService.error('[NotificationService] Error clearing notification:', error);
    }
  }

  async clearAllNotifications(): Promise<void> {
    try {
      const notifications = await this.getAllNotifications();
      for (const id of notifications) {
        await this.clearNotification(id);
      }
      this.debugService.log('[NotificationService] Cleared all notifications');
    } catch (error) {
      this.debugService.error('[NotificationService] Error clearing all notifications:', error);
    }
  }

  async getAllNotifications(): Promise<string[]> {
    try {
      const notifications = await chrome.notifications.getAll();
      return Object.keys(notifications);
    } catch (error) {
      this.debugService.error('[NotificationService] Error getting notifications:', error);
      return [];
    }
  }

  async dispose(): Promise<void> {
    try {
      await this.clearAllNotifications();
      this.debugService.log('[NotificationService] Notification service disposed');
      this.initialized = false;
    } catch (error) {
      this.debugService.error('[NotificationService] Error during disposal:', error);
    }
  }
}
