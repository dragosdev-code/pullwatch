import type { INotificationService } from '../interfaces/INotificationService';
import type { IDebugService } from '../interfaces/IDebugService';
import type { IStorageService } from '../interfaces/IStorageService';
import type { ISoundService } from '../interfaces/ISoundService';
import type { PullRequest, NotificationSound } from '../../common/types';
import {
  SETTINGS_NOTIFICATION_TEST_COOLDOWN_MS,
  SETTINGS_PREVIEW_AFTER_CLEAR_MS,
  SETTINGS_TEST_ERROR_CHROME_DENIED,
  SETTINGS_TEST_ERROR_COOLDOWN,
  SETTINGS_TEST_ERROR_DISABLED,
} from '../../common/constants';
import { getChromeNotificationPermissionLevel } from '../../common/notification-permission';
import { SETTINGS_TEST_NOTIFICATION_COPY } from '../../common/settings-test-notification-copy';
import { isPlayableSound } from '../../common/sound-config';
import { effectiveAssignedNotifyOnDrafts } from '../../common/effective-assigned-draft-notify';
import { getNotificationIconUrl } from '../../common/extension-assets';

/**
 * NotificationService handles Chrome extension notifications with sound integration.
 * Manages category-specific notifications (assigned vs merged) with configurable settings.
 * Supports draft PR filtering and per-category sound selection.
 */
export class NotificationService implements INotificationService {
  // MV3 service workers can suspend at any time, wiping all in-memory state.
  // We encode the PR URL directly into the notification ID so the click handler
  // can recover it without relying on a Map or any global variable.
  private static readonly NOTIFICATION_DELIMITER = '|';
  private static readonly NOTIFICATION_PREFIX = 'pr-alert';

  private debugService: IDebugService;
  private storageService: IStorageService;
  private soundService: ISoundService;
  private initialized = false;

  /**
   * Per-category throttle for settings "Test" (in-memory only). MV3 worker restarts reset this —
   * acceptable because the popup UI enforces the same interval and abuse volume is low.
   */
  private lastSettingsTestAtMs: { assigned: number; merged: number } = { assigned: 0, merged: 0 };

  /**
   * WHY [macOS + preview UX]: Reusing one Chrome notification id maps to an in-place update on the host OS,
   * which often refreshes Notification Center without a new banner. Preview must be a distinct id each time;
   * we still clear the prior preview id here so repeated tests do not stack rows. Scoped to settings preview only —
   * real PR toasts keep deterministic `pr-alert|…` ids in `showPRNotificationsInternal` (click handler + dedup).
   */
  private lastSettingsTestNotificationId: Partial<Record<'assigned' | 'merged', string>> = {};

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
    newPRs: PullRequest | PullRequest[]
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

      const notifyDraftsEffective = effectiveAssignedNotifyOnDrafts(settings.assigned);

      // Filter out drafts unless both notify-on-drafts AND show-drafts-in-list are on (invalid combo → treat as off).
      const filteredPRs = notifyDraftsEffective
        ? prsArray
        : prsArray.filter((pr) => pr.type !== 'draft');

      const skippedDrafts = prsArray.filter((pr) => pr.type === 'draft');
      if (skippedDrafts.length > 0 && !notifyDraftsEffective) {
        const invalidCombo =
          settings.assigned.notifyOnDrafts && !settings.assigned.showDraftsInList;
        this.debugService.log(
          invalidCombo
            ? `[NotificationService] Skipped ${skippedDrafts.length} draft PR(s) (invalid settings: notifyOnDrafts with showDraftsInList off would cause duplicate notifications; treating notifyOnDrafts as false):`
            : `[NotificationService] Skipped ${skippedDrafts.length} draft PR(s) (notifyOnDrafts=false):`,
          skippedDrafts.map((pr) => `${pr.title} (${pr.url})`)
        );
      }

      if (filteredPRs.length === 0) {
        this.debugService.log(
          '[NotificationService] All new PRs are drafts and draft notifications are off (or invalid draft settings), skipping notifications'
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
   * Sample notification for end users (settings page). Separate from Dev Test: ID must not use the
   * `pr-alert|` prefix so handleNotificationClick skips tabs.create and only clears the toast.
   * `silent: true` matches real PR alerts — OS does not double-play; extension owns sound via SoundService.
   * Uses a fresh Chrome id, scrubs all preview rows for this category from `getAll`, a short post-clear yield on
   * macOS, and distinct title/body text so the native stack is less likely to swallow the banner while sound plays.
   */
  async fireSettingsTestNotification(category: 'assigned' | 'merged'): Promise<void> {
    const now = Date.now();
    if (now - this.lastSettingsTestAtMs[category] < SETTINGS_NOTIFICATION_TEST_COOLDOWN_MS) {
      throw new Error(SETTINGS_TEST_ERROR_COOLDOWN);
    }

    // WHY [before settings read]: If Chrome denied this extension's notifications, skip storage reads,
    // clears, and create — the popup maps this error to inline unblock guidance.
    // WHY [not cached]: The user may toggle permission between Preview clicks; always re-query.
    const permissionLevel = await getChromeNotificationPermissionLevel();
    if (permissionLevel === 'denied') {
      throw new Error(SETTINGS_TEST_ERROR_CHROME_DENIED);
    }

    const settings = await this.storageService.getExtensionSettings();
    const enabled =
      category === 'assigned'
        ? settings.assigned.notificationsEnabled
        : settings.merged.notificationsEnabled;
    if (!enabled) {
      throw new Error(SETTINGS_TEST_ERROR_DISABLED);
    }

    const copy = SETTINGS_TEST_NOTIFICATION_COPY[category];
    const sound: NotificationSound =
      category === 'assigned' ? settings.assigned.sound : settings.merged.sound;
    const localIconUrl = getNotificationIconUrl();

    // WHY [ordering]: Drop the last preview for this category before allocating a new id so Notification Center
    // does not accumulate one row per cooldown window; `createNotification` still clears the new id (no-op first time).
    let clearedAnyPreview = false;
    const previousPreviewId = this.lastSettingsTestNotificationId[category];
    if (previousPreviewId) {
      await this.clearNotification(previousPreviewId);
      clearedAnyPreview = true;
    }

    const extraClears = await this.clearAllSettingsPreviewNotificationsForCategory(category);
    if (extraClears > 0) {
      clearedAnyPreview = true;
    }

    // WHY [ordering]: chrome.notifications.clear returns before macOS always removes the row; without a yield the
    // next create can be coalesced or dropped while SoundService still runs.
    if (clearedAnyPreview) {
      await this.delayMs(SETTINGS_PREVIEW_AFTER_CLEAR_MS);
    }

    const notificationId = `extension-settings-test|${category}|${Date.now()}`;

    // WHY [macOS + native NC]: Distinct Chrome ids are not always enough for a new banner; the OS may key on body
    // text. Vary message + subtitle here only — PR toasts keep stable copy + ids for click routing and dedup.
    const previewTimeLabel = new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' }).format(new Date());
    const message = `${copy.message}\n\nPreview · ${previewTimeLabel}`;
    const contextMessage = `${copy.contextMessage} · ${previewTimeLabel}`;

    await this.createNotification(
      {
        type: 'basic',
        iconUrl: localIconUrl,
        title: copy.title,
        message,
        contextMessage,
        requireInteraction: false,
        silent: true,
        priority: 2,
      },
      notificationId
    );

    this.lastSettingsTestNotificationId[category] = notificationId;
    this.lastSettingsTestAtMs[category] = Date.now();

    if (isPlayableSound(sound)) {
      try {
        await this.soundService.playNotificationSound(sound);
      } catch (soundError) {
        this.debugService.error('[NotificationService] Settings test sound failed:', soundError);
      }
    }

    this.debugService.log(`[NotificationService] Settings test notification fired (${category})`);
  }

  private delayMs(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  /**
   * Clears every live settings preview for this category (orphans after worker restart, or rows Chrome still lists).
   * Returns how many ids were cleared.
   */
  private async clearAllSettingsPreviewNotificationsForCategory(
    category: 'assigned' | 'merged'
  ): Promise<number> {
    const prefix = `extension-settings-test|${category}|`;
    try {
      const all = await chrome.notifications.getAll();
      const ids = Object.keys(all).filter((id) => id.startsWith(prefix));
      for (const id of ids) {
        await this.clearNotification(id);
      }
      return ids.length;
    } catch (error) {
      this.debugService.error('[NotificationService] Preview cleanup getAll/clear failed:', error);
      return 0;
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
    const localIconUrl = getNotificationIconUrl();

    for (const pr of prs) {
      const title = isMerged
        ? prs.length === 1
          ? 'PR Merged!'
          : `PR Merged! (${prs.indexOf(pr) + 1}/${prs.length})`
        : prs.length === 1
          ? 'New PR Review Request'
          : `New PR Review Request (${prs.indexOf(pr) + 1}/${prs.length})`;

      // Deterministic ID so the click handler can extract the URL after a
      // service-worker restart. Also gives us free deduplication: Chrome
      // replaces an existing notification with the same ID rather than
      // stacking duplicates.
      const d = NotificationService.NOTIFICATION_DELIMITER;
      const notificationId = `${NotificationService.NOTIFICATION_PREFIX}${d}${category}${d}${pr.url}`;
      const authors = pr.author;
      const primaryLogin = authors[0]?.login ?? 'Unknown Author';
      const contextSuffix = authors.length > 1 ? ` +${authors.length - 1}` : '';

      await this.createNotification(
        {
          type: 'basic',
          iconUrl: localIconUrl,
          title,
          message: pr.title,
          contextMessage: `${pr.repoName} by ${primaryLogin}${contextSuffix}`,
          requireInteraction: false,
          silent: true,
          priority: 2,
        },
        notificationId
      );

      this.debugService.log(`[NotificationService] Visual notification shown for: ${pr.title}`);
    }
  }

  /**
   * Plays notification sound for a specific category.
   */
  private async playNotificationSoundForCategory(
    sound: NotificationSound,
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

  /**
   * Extracts category and PR URL from a structured notification ID.
   * Returns null for IDs that don't follow our format so that non-PR
   * notifications (if any are ever created) degrade gracefully.
   */
  private static parseNotificationId(notificationId: string): { category: string; url: string } | null {
    const d = NotificationService.NOTIFICATION_DELIMITER;
    const prefix = NotificationService.NOTIFICATION_PREFIX;
    if (!notificationId.startsWith(`${prefix}${d}`)) return null;

    const firstPipe = notificationId.indexOf(d);
    const secondPipe = notificationId.indexOf(d, firstPipe + 1);
    if (secondPipe === -1) return null;

    const category = notificationId.substring(firstPipe + 1, secondPipe);
    // Everything after the second delimiter is the URL -- indexOf-based
    // splitting means pipes inside the URL (unlikely but possible) are
    // preserved rather than truncated.
    const url = notificationId.substring(secondPipe + 1);
    if (!url) return null;
    return { category, url };
  }

  async handleNotificationClick(notificationId: string): Promise<void> {
    try {
      this.debugService.log(`[NotificationService] Notification clicked: ${notificationId}`);

      const parsed = NotificationService.parseNotificationId(notificationId);

      if (parsed) {
        this.debugService.log(
          `[NotificationService] Opening PR URL: ${parsed.url} (category: ${parsed.category})`
        );
        // Inner try/catch: a tab-creation failure must not prevent the
        // notification from being cleared -- otherwise it stays in the
        // OS tray with no way to dismiss it programmatically.
        try {
          await chrome.tabs.create({ url: parsed.url, active: true });
        } catch (tabError) {
          this.debugService.error('[NotificationService] Failed to open tab:', tabError);
        }
      } else {
        // Graceful fallback for any notification ID that wasn't created
        // by showPRNotificationsInternal (e.g. a custom one-off notification).
        this.debugService.warn(
          `[NotificationService] Notification ID does not match expected format, skipping redirect: ${notificationId}`
        );
      }

      // Always clear -- even when the ID is unrecognised, because clicking
      // a notification should always dismiss it from the OS tray.
      await this.clearNotification(notificationId);
    } catch (error) {
      this.debugService.error('[NotificationService] Error handling notification click:', error);
    }
  }

  async createNotification(
    options: chrome.notifications.NotificationCreateOptions,
    notificationId?: string
  ): Promise<void> {
    try {
      // Clear first to work around a Chrome bug where dismissed notification IDs
      // fail to re-display on macOS (crbug #324115501)
      if (notificationId) {
        try { await chrome.notifications.clear(notificationId); } catch { /* ignore */ }
      }

      const id = notificationId
        ? await chrome.notifications.create(notificationId, options)
        : await chrome.notifications.create(options);

      if (!id) {
        this.debugService.warn(
          '[NotificationService] chrome.notifications.create returned empty ID — notification may have been silently dropped'
        );
      }

      this.debugService.log(
        `[NotificationService] Created notification: ${id} - ${options.title}`
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
