import type { PullRequest } from '@common/types';
import type { IService } from './IService';
import type { NotificationCreateOptions } from '@common/chrome-extension-service';

/**
 * Outcome of the visual-only half of a notification batch.
 *
 * WHY [split into visual + sound]: `PRService.persistAndNotifyAssigned` interleaves the storage
 * write between visual notification create and sound playback. `fired` tells the caller whether
 * any banner actually went out; if not, the caller skips the matching `play*Sound` to preserve
 * the Sound ⊆ notify invariant. `reason` is for debug-logging and tests — not behaviour-bearing.
 */
export type PrNotifyVisualResult = {
  fired: boolean;
  reason?: 'disabled' | 'all_drafts_filtered' | 'empty_input';
};

/**
 * Interface for the notification service that handles Chrome extension notifications.
 * Supports category-specific notifications for assigned and merged PRs.
 */
export interface INotificationService extends IService {
  /**
   * Shows visual + sound for new assigned PRs. Backwards-compatible wrapper around
   * {@link createAssignedPRVisuals} + {@link playAssignedSound}; prefer the split entry points
   * when the caller needs to interleave other work (e.g. persisting to storage) between them.
   */
  showAssignedPRNotifications(newPRs: PullRequest | PullRequest[]): Promise<void>;

  /**
   * Shows visual + sound for merged PRs. Backwards-compatible wrapper around
   * {@link createMergedPRVisuals} + {@link playMergedSound}.
   */
  showMergedPRNotifications(mergedPRs: PullRequest | PullRequest[]): Promise<void>;

  /**
   * Visual half of the assigned PR notification path: settings/permission/draft filtering and
   * `chrome.notifications.create`. Does **not** play sound.
   *
   * WHY [separate from sound]: Lets {@link PRService.persistAndNotifyAssigned} fire visuals, then
   * persist the fresh list to `chrome.storage.local`, then play sound. A worker death during the
   * (long) sound phase no longer leaves storage stale — the next alarm sees the PR as already
   * seen and does not re-fire. Visual stays before persist so a crash before visual still
   * re-notifies on the next tick (no silent miss).
   */
  createAssignedPRVisuals(newPRs: PullRequest | PullRequest[]): Promise<PrNotifyVisualResult>;

  /**
   * Plays the configured assigned sound through the FIFO gate. Respects `sound === 'off'` and
   * `isPlayableSound` inside the existing per-category dispatcher. No-op if assigned notifications
   * are disabled in settings (mirrors the visual-side guard so callers do not have to re-check).
   */
  playAssignedSound(): Promise<void>;

  /**
   * Visual half of the merged PR notification path: settings/permission filtering and
   * `chrome.notifications.create`. Does **not** play sound. See {@link createAssignedPRVisuals}.
   */
  createMergedPRVisuals(mergedPRs: PullRequest | PullRequest[]): Promise<PrNotifyVisualResult>;

  /**
   * Plays the configured merged sound through the FIFO gate. No-op if merged notifications are
   * disabled in settings.
   */
  playMergedSound(): Promise<void>;

  /**
   * Starts offscreen document creation so it can overlap `chrome.notifications.create` on a cold
   * worker wake. Call before {@link createAssignedPRVisuals} / {@link createMergedPRVisuals}; await
   * before {@link playAssignedSound} / {@link playMergedSound} so playback does not trail the toast.
   */
  warmNotificationAudio(): Promise<void>;

  /**
   * Fires a sample notification + sound from settings (To Review vs Merged).
   * Uses non-`pr-alert` IDs so clicks dismiss without opening a tab.
   * Each successful fire uses a fresh notification id (timestamp suffix) so macOS shows a new banner instead of
   * silently updating the prior preview in Notification Center.
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
  createNotification(options: NotificationCreateOptions, notificationId?: string): Promise<void>;

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
