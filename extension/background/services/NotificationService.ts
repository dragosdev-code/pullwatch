import type { INotificationService } from '../interfaces/INotificationService';
import type { IDebugService } from '../interfaces/IDebugService';
import type { IStorageService } from '../interfaces/IStorageService';
import type { ISoundService } from '../interfaces/ISoundService';
import type { PullRequest } from '../../common/types';

/**
 * NotificationService handles Chrome extension notifications with sound integration.
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

  async showNewPRNotifications(newPR: PullRequest): Promise<void> {
    // Stub implementation

    this.createNotification({
      type: 'basic',
      iconUrl: 'https://github.com/favicon.ico',
      title: 'New PR Review Request',
      message: `${newPR.title}\n${newPR.repoName}`,
      contextMessage: `by ${newPR.author.login}`,
      requireInteraction: false, // macOS often works better without this
      silent: false, // Enable notification sound
      priority: 2, // High priority to ensure sound
    });

    this.debugService.log(`[NotificationService] Would show ${newPR.title} notification`);
  }

  async handleNotificationClick(notificationId: string): Promise<void> {
    // Stub implementation
    this.debugService.log(`[NotificationService] Notification clicked: ${notificationId}`);
  }

  async createNotification(options: chrome.notifications.NotificationCreateOptions): Promise<void> {
    // Stub implementation
    chrome.notifications.create(options);
    this.debugService.log(`[NotificationService] Creating notification: ${options.title}`);
  }

  async clearNotification(notificationId: string): Promise<void> {
    // Stub implementation
    this.debugService.log(`[NotificationService] Clearing notification: ${notificationId}`);
  }

  async clearAllNotifications(): Promise<void> {
    // Stub implementation
    this.debugService.log('[NotificationService] Clearing all notifications');
  }

  async getAllNotifications(): Promise<string[]> {
    // Stub implementation
    return [];
  }

  async areNotificationsEnabled(): Promise<boolean> {
    const settings = await this.storageService.getExtensionSettings();
    return settings.notificationsEnabled;
  }

  async setNotificationsEnabled(enabled: boolean): Promise<void> {
    await this.storageService.setExtensionSettings({ notificationsEnabled: enabled });
  }

  async dispose(): Promise<void> {
    this.debugService.log('[NotificationService] Notification service disposed');
    this.initialized = false;
  }
}
