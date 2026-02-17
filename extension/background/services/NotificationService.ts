import type { INotificationService } from '../interfaces/INotificationService';
import type { IDebugService } from '../interfaces/IDebugService';
import type { IStorageService } from '../interfaces/IStorageService';
import type { ISoundService } from '../interfaces/ISoundService';
import type { PullRequest } from '../../common/types';

/**
 * NotificationService handles Chrome extension notifications with sound integration.
 * Manages all notification-related functionality including visual notifications and sound alerts.
 */
export class NotificationService implements INotificationService {
  private debugService: IDebugService;
  private storageService: IStorageService;
  private soundService: ISoundService;
  private initialized = false;

  constructor(
    debugService: IDebugService,
    storageService: IStorageService,
    soundService: ISoundService
  ) {
    this.debugService = debugService;
    this.storageService = storageService;
    this.soundService = soundService;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    this.debugService.log('[NotificationService] Notification service initialized');
  }

  async showNewPRNotifications(
    newPRs: PullRequest | PullRequest[],
    forceShow = false
  ): Promise<void> {
    try {
      // Check if notifications are enabled (unless forced)
      const settings = await this.storageService.getExtensionSettings();
      if (!forceShow && !settings.notificationsEnabled) {
        this.debugService.log('[NotificationService] Notifications disabled, skipping');
        return;
      }

      // Normalize input to array
      const prsArray = Array.isArray(newPRs) ? newPRs : [newPRs];
      this.debugService.log(
        `[NotificationService] Showing notifications for ${prsArray.length} PR(s)`
      );

      // Show visual notifications for each PR
      for (const pr of prsArray) {
        await this.createNotification({
          type: 'basic',
          iconUrl: 'https://github.com/favicon.ico', // Use extension icon
          title:
            prsArray.length === 1
              ? 'New PR Review Request'
              : `New PR Review Request (${prsArray.indexOf(pr) + 1}/${prsArray.length})`,
          message: `${pr.title}`,
          contextMessage: `${pr.repoName} by ${pr.author.login}`,
          requireInteraction: false,
          silent: true, // Allow Chrome to play its notification sound
          priority: 2,
        });

        this.debugService.log(`[NotificationService] Visual notification shown for: ${pr.title}`);
      }

      // Play sound notification if enabled (separate from visual notifications)
      if (settings.soundEnabled) {
        try {
          await this.soundService.playNotificationSound();
          this.debugService.log(
            `[NotificationService] Sound notification played for ${prsArray.length} new PR(s)`
          );
        } catch (soundError) {
          this.debugService.error(
            '[NotificationService] Error playing notification sound:',
            soundError
          );
          // Don't fail the entire notification if sound fails
        }
      } else {
        this.debugService.log('[NotificationService] Sound notifications disabled, skipping sound');
      }
    } catch (error) {
      this.debugService.error('[NotificationService] Error showing notifications:', error);
      throw error;
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
