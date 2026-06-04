import type {
  INotificationService,
  PrNotifyVisualResult,
} from '../interfaces/INotificationService';
import type { IDebugService } from '../interfaces/IDebugService';
import type { IStorageService } from '../interfaces/IStorageService';
import type { ISoundService } from '../interfaces/ISoundService';
import type { PullRequest, NotificationSound } from '@common/types';
import {
  SETTINGS_NOTIFICATION_TEST_COOLDOWN_MS,
  SETTINGS_PREVIEW_AFTER_CLEAR_MS,
  SETTINGS_TEST_ERROR_CHROME_DENIED,
  SETTINGS_TEST_ERROR_COOLDOWN,
  SETTINGS_TEST_ERROR_DISABLED,
} from '@common/constants';
import { getChromeNotificationPermissionLevel } from '@common/notification-permission';
import { SETTINGS_TEST_NOTIFICATION_COPY } from '@common/settings-test-notification-copy';
import { isPlayableSound } from '@common/sound-config';
import { effectiveAssignedNotifyOnDrafts } from '@common/effective-assigned-draft-notify';
import { getNotificationIconUrl } from '@common/extension-assets';
import {
  chromeExtensionService,
  type NotificationCreateOptions,
} from '@common/chrome-extension-service';
import type { AlarmSeqClock } from '../domain/pr-list-trust';

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
  private static readonly NOTIFICATION_BATCH_PREFIX = 'pr-alert-batch';

  private debugService: IDebugService;
  private storageService: IStorageService;
  private soundService: ISoundService;
  private alarmSeqClock: AlarmSeqClock;
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
    alarmSeqClock: AlarmSeqClock;
  }) {
    this.debugService = deps.debugService;
    this.storageService = deps.storageService;
    this.soundService = deps.soundService;
    this.alarmSeqClock = deps.alarmSeqClock;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    this.debugService.log('[NotificationService] Notification service initialized');
  }

  /**
   * WHY [delegate to SoundService]: PRService only depends on INotificationService; offscreen
   * lifecycle stays centralized. Overlap create with the visual round-trip via PRService's await
   * pattern (start warm, create visual, persist, await warm, play sound).
   */
  async warmNotificationAudio(): Promise<void> {
    await this.soundService.ensureOffscreenDocument();
  }

  /**
   * Shows visual + sound for new assigned pull requests.
   *
   * WHY [thin wrapper]: External callers (including legacy tests) keep this single-call shape.
   * `PRService.persistAndNotifyAssigned` calls {@link createAssignedPRVisuals} and
   * {@link playAssignedSound} directly so it can interleave `storage.setStoredPRs` between them.
   */
  async showAssignedPRNotifications(newPRs: PullRequest | PullRequest[]): Promise<void> {
    const visual = await this.createAssignedPRVisuals(newPRs);
    if (visual.fired) {
      await this.playAssignedSound();
    }
  }

  async createAssignedPRVisuals(
    newPRs: PullRequest | PullRequest[]
  ): Promise<PrNotifyVisualResult> {
    try {
      const settings = await this.storageService.getExtensionSettings();

      if (!settings.assigned.notificationsEnabled) {
        this.debugService.log('[NotificationService] Assigned PR notifications disabled, skipping');
        return { fired: false, reason: 'disabled' };
      }

      const prsArray = Array.isArray(newPRs) ? newPRs : [newPRs];
      if (prsArray.length === 0) {
        return { fired: false, reason: 'empty_input' };
      }

      const notifyDraftsEffective = effectiveAssignedNotifyOnDrafts(settings.assigned);

      // WHY [invalid combo guardrail]: `notifyOnDrafts: true` paired with `showDraftsInList: false`
      // would lead the user to a notification for a PR they cannot see in the popup list. Treating
      // the combo as off is documented in wiki/Notifications-and-Sound.md → "Drafts are off by default".
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
        return { fired: false, reason: 'all_drafts_filtered' };
      }

      this.debugService.log(
        `[NotificationService] Showing assigned PR notifications for ${filteredPRs.length} PR(s)`
      );

      await this.showPRNotificationsInternal(filteredPRs, 'assigned');
      return { fired: true };
    } catch (error) {
      this.debugService.error('[NotificationService] Error creating assigned PR visuals:', error);
      throw error;
    }
  }

  async playAssignedSound(): Promise<void> {
    const settings = await this.storageService.getExtensionSettings();
    // WHY [re-check enabled]: callers (PRService) decide to play based on a `fired` flag returned
    // by createAssignedPRVisuals, but settings can change between the visual create and the sound
    // (e.g. user toggled off in popup during the persist await). Stay consistent with the visual.
    if (!settings.assigned.notificationsEnabled) {
      return;
    }
    await this.playNotificationSoundForCategory(settings.assigned.sound, 'assigned');
  }

  /**
   * Shows visual + sound for merged pull requests. Thin wrapper over
   * {@link createMergedPRVisuals} + {@link playMergedSound}; see {@link showAssignedPRNotifications}.
   */
  async showMergedPRNotifications(mergedPRs: PullRequest | PullRequest[]): Promise<void> {
    const visual = await this.createMergedPRVisuals(mergedPRs);
    if (visual.fired) {
      await this.playMergedSound();
    }
  }

  async createMergedPRVisuals(
    mergedPRs: PullRequest | PullRequest[]
  ): Promise<PrNotifyVisualResult> {
    try {
      const settings = await this.storageService.getExtensionSettings();

      if (!settings.merged.notificationsEnabled) {
        this.debugService.log('[NotificationService] Merged PR notifications disabled, skipping');
        return { fired: false, reason: 'disabled' };
      }

      const prsArray = Array.isArray(mergedPRs) ? mergedPRs : [mergedPRs];
      if (prsArray.length === 0) {
        return { fired: false, reason: 'empty_input' };
      }

      this.debugService.log(
        `[NotificationService] Showing merged PR notifications for ${prsArray.length} PR(s)`
      );

      await this.showPRNotificationsInternal(prsArray, 'merged');
      return { fired: true };
    } catch (error) {
      this.debugService.error('[NotificationService] Error creating merged PR visuals:', error);
      throw error;
    }
  }

  async playMergedSound(): Promise<void> {
    const settings = await this.storageService.getExtensionSettings();
    if (!settings.merged.notificationsEnabled) {
      return;
    }
    await this.playNotificationSoundForCategory(settings.merged.sound, 'merged');
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
    const previewTimeLabel = new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' }).format(
      new Date()
    );
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
      const all = await chromeExtensionService.notifications.getAll();
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
    if (prs.length > 1) {
      await this.showSummaryNotification(prs, category);
      return;
    }

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

  private async showSummaryNotification(
    prs: PullRequest[],
    category: 'assigned' | 'merged'
  ): Promise<void> {
    const isMerged = category === 'merged';
    const localIconUrl = getNotificationIconUrl();
    const visibleTitles = prs.slice(0, 3).map((pr) => `- ${pr.title}`);
    const hiddenCount = prs.length - visibleTitles.length;
    const suffix = hiddenCount > 0 ? `\n+${hiddenCount} more` : '';
    const d = NotificationService.NOTIFICATION_DELIMITER;
    // WHY [alarm seq, not wall clock]: Batch ids share the tombstone wave counter. Within one alarm wave
    // `current()` is stable until EventService advances after persist — Chrome replaces a duplicate
    // summary for the same category instead of stacking rows when the wave retries or re-notifies.
    const waveKey = await this.alarmSeqClock.current();
    const notificationId = `${NotificationService.NOTIFICATION_BATCH_PREFIX}${d}${category}${d}${waveKey}`;

    // WHY [attention budget]: A polling recovery can surface many valid events at once. Keep the
    // event detail in one native row so the user gets signal without a wall of OS interruptions.
    await this.createNotification(
      {
        type: 'basic',
        iconUrl: localIconUrl,
        title: isMerged ? `${prs.length} PRs were merged` : `${prs.length} new PR review requests`,
        message: `${visibleTitles.join('\n')}${suffix}`,
        contextMessage: isMerged
          ? 'Pullwatch merged PR summary'
          : 'Pullwatch review request summary',
        requireInteraction: false,
        silent: true,
        priority: 2,
      },
      notificationId
    );

    this.debugService.log(
      `[NotificationService] Summary notification shown for ${prs.length} ${category} PR(s)`
    );
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
      this.debugService.log(
        `[NotificationService] ${category} notification sound played: ${sound}`
      );
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
  private static parseNotificationId(
    notificationId: string
  ): { category: string; url: string } | null {
    const d = NotificationService.NOTIFICATION_DELIMITER;
    const prefix = NotificationService.NOTIFICATION_PREFIX;
    const batchPrefix = NotificationService.NOTIFICATION_BATCH_PREFIX;
    if (notificationId.startsWith(`${batchPrefix}${d}`)) {
      const firstPipe = notificationId.indexOf(d);
      const secondPipe = notificationId.indexOf(d, firstPipe + 1);
      if (secondPipe === -1) return null;
      const category = notificationId.substring(firstPipe + 1, secondPipe);
      return { category, url: chromeExtensionService.runtime.getURL('index.html') };
    }

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
    // WHY [scheme allowlist]: defense-in-depth. PR url originates from parser output against
    // github.com HTML, but a parser regression or upstream poisoning could yield data:/file:/etc.
    // tabs.create with such a URL would open it; restrict to https://github.com/ before navigation.
    if (!url.startsWith('https://github.com/')) return null;
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
          await chromeExtensionService.tabs.create({ url: parsed.url, active: true });
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
    options: NotificationCreateOptions,
    notificationId?: string
  ): Promise<void> {
    try {
      // Clear first to work around a Chrome bug where dismissed notification IDs
      // fail to re-display on macOS (crbug #324115501)
      if (notificationId) {
        try {
          await chromeExtensionService.notifications.clear(notificationId);
        } catch {
          /* ignore */
        }
      }

      const id = notificationId
        ? await chromeExtensionService.notifications.create(notificationId, options)
        : await chromeExtensionService.notifications.create(options);

      if (!id) {
        this.debugService.warn(
          '[NotificationService] notifications.create returned empty ID — notification may have been silently dropped'
        );
      }

      this.debugService.log(`[NotificationService] Created notification: ${id} - ${options.title}`);
    } catch (error) {
      this.debugService.error('[NotificationService] Error creating notification:', error);
      throw error;
    }
  }

  async clearNotification(notificationId: string): Promise<void> {
    try {
      await chromeExtensionService.notifications.clear(notificationId);
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
      const notifications = await chromeExtensionService.notifications.getAll();
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
