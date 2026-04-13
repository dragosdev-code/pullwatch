import type { IEventService } from '../interfaces/IEventService';
import type { IDebugService } from '../interfaces/IDebugService';
import type { ServiceContainer } from '../core/ServiceContainer';
import type {
  RuntimeMessage,
  RuntimeRequestMessage,
  MessageResponse,
  ExtensionSettings,
  NotificationSound,
  DevTestNotificationOverrides,
  SettingsNotificationTestPayload,
} from '../../common/types';
import {
  SETTINGS_TEST_ERROR_COOLDOWN,
  SETTINGS_TEST_ERROR_DISABLED,
  STORAGE_KEY_PR_FETCH_IN_PROGRESS,
} from '../../common/constants';
import { isGitHubWebSessionAuthError } from '../../common/errors';
import {
  DEV_TEST_ACTION,
  EVENT_FETCH_PRS,
  EVENT_OFFSCREEN_READY,
  EVENT_PLAY_SOUND,
  EVENT_SETTINGS_UPDATED,
  isBroadcastAction,
  PR_DATA_ACTION,
  PREVIEW_SOUND_ACTION,
  SETTINGS_ACTION,
  type RequestRuntimeAction,
} from '../../common/runtime-actions';

type MessageHandler = (
  message: RuntimeMessage,
  sendResponse: (r: MessageResponse) => void
) => Promise<void> | void;

/**
 * EventService coordinates Chrome extension events and handles message routing.
 * Central hub for all extension events, messages, and service coordination.
 */
export class EventService implements IEventService {
  private debugService: IDebugService;
  private serviceContainer: ServiceContainer;
  private initialized = false;
  /** Coalesces parallel manual refresh messages (assigned/merged/authored) into one alarm reset. */
  private fetchAlarmPushBackInFlight: Promise<void> | null = null;
  /**
   * Count of overlapping PR fetch operations (manual messages run in parallel; alarm is one block).
   * WHY [UI flag]: a single boolean per handler would clear `pr_fetch_in_progress` while sibling fetches still run.
   * WHY [identity barrier]: when this returns to 0, {@link withPrUiFetchIndicator} persists viewer identity once —
   * see that method for the account-swap ordering contract with {@link PRService}.
   */
  private prUiFetchDepth = 0;
  private readonly dispatchTable: Map<RequestRuntimeAction, MessageHandler>;

  constructor(debugService: IDebugService, serviceContainer: ServiceContainer) {
    this.debugService = debugService;
    this.serviceContainer = serviceContainer;

    this.dispatchTable = new Map<RequestRuntimeAction, MessageHandler>([
      [PR_DATA_ACTION.getAssignedPRs, (m, r) => this.handleAssignedPRDataActions(m, r)],
      [PR_DATA_ACTION.fetchAssignedPRs, (m, r) => this.handleAssignedPRDataActions(m, r)],
      [PR_DATA_ACTION.getMergedPRs, (m, r) => this.handleMergedPRDataActions(m, r)],
      [PR_DATA_ACTION.fetchMergedPRs, (m, r) => this.handleMergedPRDataActions(m, r)],
      [PR_DATA_ACTION.getAuthoredPRs, (m, r) => this.handleAuthoredPRDataActions(m, r)],
      [PR_DATA_ACTION.fetchAuthoredPRs, (m, r) => this.handleAuthoredPRDataActions(m, r)],
      [SETTINGS_ACTION.saveSettings, (m, r) => this.handleSettingsActions(m, r)],
      [SETTINGS_ACTION.getSettings, (m, r) => this.handleSettingsActions(m, r)],
      [SETTINGS_ACTION.testSettingsNotification, (m, r) => this.handleSettingsActions(m, r)],
      [EVENT_PLAY_SOUND, (m, r) => this.handleOffscreenActions(m, r)],
      [EVENT_OFFSCREEN_READY, (m, r) => this.handleOffscreenActions(m, r)],
      [PREVIEW_SOUND_ACTION.previewSound, (m, r) => this.handlePreviewSoundAction(m, r)],
      [PREVIEW_SOUND_ACTION.stopPreviewSound, (m, r) => this.handleStopPreviewSoundAction(m, r)],
      [DEV_TEST_ACTION.fireNotification, (m, r) => this.handleDevTestActions(m, r)],
      [DEV_TEST_ACTION.startLoop, (m, r) => this.handleDevTestActions(m, r)],
      [DEV_TEST_ACTION.stopLoop, (m, r) => this.handleDevTestActions(m, r)],
      [DEV_TEST_ACTION.getLooperState, (m, r) => this.handleDevTestActions(m, r)],
      [DEV_TEST_ACTION.overrideAlarm, (m, r) => this.handleDevTestActions(m, r)],
      [DEV_TEST_ACTION.restoreAlarm, (m, r) => this.handleDevTestActions(m, r)],
      [DEV_TEST_ACTION.getAlarmState, (m, r) => this.handleDevTestActions(m, r)],
      [DEV_TEST_ACTION.getScraperUrls, (m, r) => this.handleDevTestActions(m, r)],
    ]);
  }

  /**
   * Initializes the event service.
   * NOTE: Chrome event listeners are registered synchronously in main.ts
   * using the "initialization gate" pattern to ensure the service worker
   * wakes up reliably for alarms, messages, and other events.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.initialized = true;
    this.debugService.log('[EventService] Event service initialized');
  }

  /**
   * WHY [storage not sendMessage]: Popup reads `chrome.storage.local` and listens with
   * `chrome.storage.onChanged`; removing keys here invalidates the GitHub web session for every
   * open UI surface without requiring a document reload.
   */
  private async invalidateGitHubWebSessionAfterAuthFailure(): Promise<void> {
    try {
      const storageService = this.serviceContainer.getService('storageService');
      const badgeService = this.serviceContainer.getService('badgeService');
      await storageService.clearGitHubWebSessionCaches();
      await badgeService.setDefaultBadge();
    } catch (err) {
      this.debugService.error('[EventService] GitHub session wipe failed after auth error:', err);
    }
  }

  private logCatchAsWarningIfAuth(context: string, error: unknown): void {
    if (isGitHubWebSessionAuthError(error)) {
      this.debugService.warn(`[EventService] ${context}:`, error);
    } else {
      this.debugService.error(`[EventService] ${context}:`, error);
    }
  }

  /**
   * Handles extension installation and updates.
   */
  async handleInstallation(details: chrome.runtime.InstalledDetails): Promise<void> {
    try {
      this.debugService.log('[EventService] Handling installation:', details);

      // Get services directly from container
      const permissionService =
        this.serviceContainer.getService('permissionService');
      const alarmService = this.serviceContainer.getService('alarmService');
      const prService = this.serviceContainer.getService('prService');
      const badgeService = this.serviceContainer.getService('badgeService');

      // Handle installation logic
      await permissionService.checkAllPermissions();
      await alarmService.setupFetchAlarm();

      if (details.reason === 'install') {
        this.debugService.log('[EventService] First install detected');
        await badgeService.setLoadingBadge();
      } else if (details.reason === 'update') {
        this.debugService.log('[EventService] Extension updated');
      }

      // WHY [ordering]: Installation only fetches assigned data for fast first render, but
      // identity still comes from that HTML and must be persisted before the first alarm cycle.
      await prService.fetchAndUpdateAssignedPRs(true);
      await prService.persistResolvedViewerIdentity();
    } catch (error) {
      this.logCatchAsWarningIfAuth('Error handling installation', error);
    }
  }

  /**
   * Handles extension startup.
   */
  async handleStartup(): Promise<void> {
    try {
      this.debugService.log('[EventService] Handling startup');

      // Get services directly from container
      const permissionService =
        this.serviceContainer.getService('permissionService');
      const alarmService = this.serviceContainer.getService('alarmService');
      const prService = this.serviceContainer.getService('prService');

      // Handle startup logic
      await permissionService.checkAllPermissions();
      await alarmService.setupFetchAlarm();
      await prService.fetchAndUpdateAssignedPRs(true);
      await prService.persistResolvedViewerIdentity();
    } catch (error) {
      this.logCatchAsWarningIfAuth('Error handling startup', error);
    }
  }

  /**
   * Handles alarm events.
   */
  async handleAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
    try {
      this.debugService.log('[EventService] Handling alarm:', alarm.name);

      if (alarm.name === EVENT_FETCH_PRS) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          this.debugService.log('[EventService] Skipping fetch - device appears offline');
          return;
        }

        const rateLimitService =
          this.serviceContainer.getService('rateLimitService');
        if (rateLimitService.shouldSkipFetch()) {
          this.debugService.log('[EventService] Skipping fetch - rate limited (backoff active)');
          return;
        }

        this.debugService.log('[EventService] Fetch alarm triggered - fetching all PR types');

        const prService = this.serviceContainer.getService('prService');

        // Alarm cadence is the rate limiter; each tick should observe GitHub, not short TTL cache.
        // WHY [single barrier]: One `withPrUiFetchIndicator` callback (depth 1) runs the three fetches
        // sequentially; identity still persists only when that whole block completes.
        await this.withPrUiFetchIndicator(async () => {
          await prService.fetchAndUpdateAssignedPRs(false, true);
          await prService.updateMergedPRs(false, true);
          await prService.updateAuthoredPRs(false, true);
        });

        this.debugService.log('[EventService] Completed alarm fetch for all PR types');
      } else {
        this.debugService.warn('[EventService] Unknown alarm triggered:', alarm.name);
      }
    } catch (error) {
      if (isGitHubWebSessionAuthError(error)) {
        await this.invalidateGitHubWebSessionAfterAuthFailure();
      }
      this.logCatchAsWarningIfAuth('Error handling alarm', error);
    }
  }

  /**
   * Handles notification clicks.
   */
  async handleNotificationClick(notificationId: string): Promise<void> {
    try {
      this.debugService.log('[EventService] Handling notification click:', notificationId);

      // Get notification service and handle click
      const notificationService =
        this.serviceContainer.getService('notificationService');
      await notificationService.handleNotificationClick(notificationId);
    } catch (error) {
      this.debugService.error('[EventService] Error handling notification click:', error);
    }
  }

  /**
   * Main message handler for all Chrome extension messages.
   * Uses a Map-based dispatch table for O(1) action routing.
   * Returns void -- main.ts owns the `return true` decision for the Chrome API.
   */
  handleMessage(
    message: RuntimeMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ): void {
    const action = message.action;
    if (isBroadcastAction(action)) {
      this.debugService.warn('[EventService] Unhandled message action:', action);
      sendResponse({ success: false, error: `Unknown action: ${action}` });
      return;
    }

    const handler = this.dispatchTable.get(action);

    if (!handler) {
      this.debugService.warn('[EventService] Unhandled message action:', action);
      sendResponse({ success: false, error: `Unknown action: ${action}` });
      return;
    }

    const result = handler(message, sendResponse);

    // Wrap any async handler result to catch unhandled rejections
    if (result && typeof (result as Promise<void>).catch === 'function') {
      (result as Promise<void>).catch((err) => {
        this.debugService.error(`[EventService] Error in async handler for action ${action}:`, err);
        try {
          sendResponse({ success: false, error: `Unhandled error in ${action} handler` });
        } catch (e) {
          this.debugService.error('[EventService] Failed to send error response:', e);
        }
      });
    }
  }

  /**
   * Assigned PR actions: `get*` returns the persisted snapshot only (for tools or callers that
   * still message the background). The popup list UI reads `chrome.storage.local` directly so it
   * does not wake the service worker. `fetch*` is user-initiated refresh: GitHub + storage + alarm pushback.
   */
  async handleAssignedPRDataActions(
    message: RuntimeMessage,
    sendResponse: (response: MessageResponse) => void
  ): Promise<void> {
    try {
      const prService = this.serviceContainer.getService('prService');

      if (this.isMessageAction(message, PR_DATA_ACTION.getAssignedPRs)) {
        const storedPRs = await prService.getStoredAssignedPRs();
        this.debugService.log(
          `[EventService] getAssignedPRs: returning ${storedPRs.length} stored assigned PRs`
        );
        sendResponse({ success: true, data: storedPRs });
      } else if (this.isMessageAction(message, PR_DATA_ACTION.fetchAssignedPRs)) {
        // fetchAssignedPRs: Fetch fresh data from GitHub and update storage (manual refresh)
        this.debugService.log('[EventService] Manual refresh - fetching fresh assigned PRs from GitHub');
        await this.coalescedPushBackFetchAlarm();
        const prs = await this.withPrUiFetchIndicator(async () =>
          prService.fetchAndUpdateAssignedPRs(true)
        );
        this.debugService.log(`[EventService] fetchAndUpdateAssignedPRs returned ${prs.length} PRs`);

        const response = { success: true, data: prs };
        this.debugService.log(`[EventService] Sending response with fresh assigned PRs`);
        sendResponse(response);
      }
    } catch (error) {
      if (isGitHubWebSessionAuthError(error)) {
        await this.invalidateGitHubWebSessionAfterAuthFailure();
      }
      this.logCatchAsWarningIfAuth('Error handling assigned PR data actions', error);
      sendResponse({ success: false, error: 'Failed to handle assigned PR action' });
    }
  }

  /**
   * Merged PR actions — same contract as {@link handleAssignedPRDataActions}: get is snapshot-only,
   * fetch is manual GitHub refresh with alarm reschedule.
   */
  async handleMergedPRDataActions(
    message: RuntimeMessage,
    sendResponse: (response: MessageResponse) => void
  ): Promise<void> {
    try {
      const prService = this.serviceContainer.getService('prService');

      if (this.isMessageAction(message, PR_DATA_ACTION.getMergedPRs)) {
        const storedPRs = await prService.getStoredMergedPRs();
        this.debugService.log(`[EventService] getMergedPRs: returning ${storedPRs.length} stored merged PRs`);
        sendResponse({ success: true, data: storedPRs });
      } else if (this.isMessageAction(message, PR_DATA_ACTION.fetchMergedPRs)) {
        this.debugService.log(
          '[EventService] Manual refresh - fetching fresh merged PRs from GitHub'
        );
        await this.coalescedPushBackFetchAlarm();
        const merged = await this.withPrUiFetchIndicator(async () => prService.updateMergedPRs(true));
        this.debugService.log(`[EventService] updateMergedPRs returned ${merged.length} PRs`);
        sendResponse({ success: true, data: merged });
      }
    } catch (error) {
      if (isGitHubWebSessionAuthError(error)) {
        await this.invalidateGitHubWebSessionAfterAuthFailure();
      }
      this.logCatchAsWarningIfAuth('Error handling merged PR data actions', error);
      sendResponse({ success: false, error: 'Failed to handle merged PR action' });
    }
  }

  /**
   * Mirrors in-flight PR fetches to `chrome.storage.local` so an open popup can show “Updating…”
   * for alarm ticks (no React Query mutations) and keeps the flag true until parallel manual handlers finish.
   *
   * **Fetch + account-swap flow (manual refresh):** the popup sends three messages; each handler
   * enters here, so {@link prUiFetchDepth} increments up to 3 and decrements as each fetch completes
   * (completion order is undefined). {@link PRService} compares HTML-derived login to
   * `github_viewer_identity` for silent baseline; if the first finisher persisted identity early,
   * siblings would see baseline === current and miss the swap. This wrapper therefore calls
   * {@link PRService.persistResolvedViewerIdentity} only when depth returns to **0** (last sibling done).
   *
   * **Alarm tick:** one callback runs assigned → merged → authored sequentially (depth stays 1);
   * identity persists once at the end of that block — same storage contract as manual refresh.
   */
  private async withPrUiFetchIndicator<T>(fn: () => Promise<T>): Promise<T> {
    const storageService = this.serviceContainer.getService('storageService');
    const prService = this.serviceContainer.getService('prService');
    if (this.prUiFetchDepth === 0) {
      await storageService.set(STORAGE_KEY_PR_FETCH_IN_PROGRESS, true);
    }
    this.prUiFetchDepth += 1;
    try {
      return await fn();
    } finally {
      this.prUiFetchDepth -= 1;
      if (this.prUiFetchDepth === 0) {
        try {
          await prService.persistResolvedViewerIdentity();
        } catch (err) {
          this.debugService.error('[EventService] persistResolvedViewerIdentity failed:', err);
        }
        await storageService.set(STORAGE_KEY_PR_FETCH_IN_PROGRESS, false);
      }
    }
  }

  /**
   * Ensures concurrent manual refresh handlers share one alarm reschedule (popup fires three messages).
   */
  private coalescedPushBackFetchAlarm(): Promise<void> {
    if (this.fetchAlarmPushBackInFlight !== null) {
      return this.fetchAlarmPushBackInFlight;
    }
    const alarmService = this.serviceContainer.getService('alarmService');
    const pending = alarmService.rescheduleFetchAlarmFromNow().finally(() => {
      this.fetchAlarmPushBackInFlight = null;
    });
    this.fetchAlarmPushBackInFlight = pending;
    return pending;
  }

  /**
   * Authored PR actions — same contract as {@link handleAssignedPRDataActions}.
   */
  async handleAuthoredPRDataActions(
    message: RuntimeMessage,
    sendResponse: (response: MessageResponse) => void
  ): Promise<void> {
    try {
      const prService = this.serviceContainer.getService('prService');

      if (this.isMessageAction(message, PR_DATA_ACTION.getAuthoredPRs)) {
        const storedPRs = await prService.getStoredAuthoredPRs();
        this.debugService.log(
          `[EventService] getAuthoredPRs: returning ${storedPRs.length} stored authored PRs`
        );
        sendResponse({ success: true, data: storedPRs });
      } else if (this.isMessageAction(message, PR_DATA_ACTION.fetchAuthoredPRs)) {
        this.debugService.log(
          '[EventService] Manual refresh - fetching fresh authored PRs from GitHub'
        );
        await this.coalescedPushBackFetchAlarm();
        const authored = await this.withPrUiFetchIndicator(async () => prService.updateAuthoredPRs(true));
        sendResponse({ success: true, data: authored });
      }
    } catch (error) {
      if (isGitHubWebSessionAuthError(error)) {
        await this.invalidateGitHubWebSessionAfterAuthFailure();
      }
      this.logCatchAsWarningIfAuth('Error handling authored PR data actions', error);
      sendResponse({ success: false, error: 'Failed to handle authored PR action' });
    }
  }


  /**
   * Handles settings related actions (saveSettings, getSettings, testSettingsNotification).
   */
  async handleSettingsActions(
    message: RuntimeMessage,
    sendResponse: (response: MessageResponse) => void
  ): Promise<void> {
    try {
      if (message.action === SETTINGS_ACTION.testSettingsNotification) {
        const payload = (message as RuntimeRequestMessage<SettingsNotificationTestPayload>).payload;
        if (
          !payload ||
          (payload.category !== 'assigned' && payload.category !== 'merged')
        ) {
          sendResponse({ success: false, error: 'Invalid test notification payload' });
          return;
        }
        const notificationService = this.serviceContainer.getService('notificationService');
        try {
          await notificationService.fireSettingsTestNotification(payload.category);
          sendResponse({ success: true });
        } catch (err) {
          if (
            err instanceof Error &&
            (err.message === SETTINGS_TEST_ERROR_COOLDOWN ||
              err.message === SETTINGS_TEST_ERROR_DISABLED)
          ) {
            sendResponse({ success: false, error: err.message });
            return;
          }
          this.debugService.error('[EventService] Settings test notification failed:', err);
          sendResponse({ success: false, error: 'Failed to fire test notification' });
        }
        return;
      }

      const storageService = this.serviceContainer.getService('storageService');

      if (this.isMessageAction<Partial<ExtensionSettings>>(message, SETTINGS_ACTION.saveSettings)) {
        if (message.payload) {
          await storageService.setExtensionSettings(message.payload);
          const settings = await storageService.getExtensionSettings();

          // Notify all open popups that settings have changed
          this.broadcastSettingsUpdate(settings);

          sendResponse({ success: true, data: settings });
        } else {
          sendResponse({ success: false, error: 'No settings payload provided' });
        }
      } else if (this.isMessageAction(message, SETTINGS_ACTION.getSettings)) {
        const settings = await storageService.getExtensionSettings();
        sendResponse({ success: true, data: settings });
      }
    } catch (error) {
      this.debugService.error('[EventService] Error handling settings:', error);
      sendResponse({ success: false, error: 'Failed to handle settings' });
    }
  }

  /**
   * Broadcasts settings update to all open popups/extension contexts.
   */
  private async broadcastSettingsUpdate(settings: ExtensionSettings): Promise<void> {
    try {
      await chrome.runtime.sendMessage({
        action: EVENT_SETTINGS_UPDATED,
        data: settings,
      });
      this.debugService.log('[EventService] Broadcasted settings update to all contexts');
    } catch (error) {
      // Other contexts might be closed - that's ok, just log it
      this.debugService.log(
        '[EventService] Could not broadcast settings update (some contexts may be closed):',
        error
      );
    }
  }

  /**
   * Handles offscreen related actions (sound playback, etc.).
   */
  async handleOffscreenActions(
    message: RuntimeMessage,
    sendResponse: (response: MessageResponse) => void
  ): Promise<void> {
    try {
      if (this.isMessageAction(message, EVENT_PLAY_SOUND)) {
        const soundService = this.serviceContainer.getService('soundService');

        await soundService.ensureOffscreenDocument();

        // Send message to the offscreen document for audio playback
        chrome.runtime.sendMessage(
          { action: EVENT_PLAY_SOUND, payload: message.payload },
          (response) => {
            if (chrome.runtime.lastError) {
              this.debugService.error(
                '[EventService] Error sending play sound message to offscreen:',
                chrome.runtime.lastError.message
              );
              sendResponse({ success: false, error: 'Failed to message offscreen for sound play' });
            } else {
              this.debugService.log(
                '[EventService] Play sound message sent to offscreen, response:',
                response
              );
              sendResponse(
                response || { success: true, data: 'Play sound message processed by offscreen.' }
              );
            }
          }
        );
      } else if (this.isMessageAction(message, EVENT_OFFSCREEN_READY)) {
        this.debugService.log('[EventService] Offscreen document reported ready.');
        sendResponse({ success: true, data: 'Offscreen ready acknowledged' });
      }
    } catch (error) {
      this.debugService.error('[EventService] Error handling offscreen actions:', error);
      sendResponse({ success: false, error: 'Failed to handle offscreen action' });
    }
  }

  /**
   * Handles sound preview action from the popup/settings.
   * Plays the specified notification sound through the offscreen document.
   */
  async handlePreviewSoundAction(
    message: RuntimeMessage,
    sendResponse: (response: MessageResponse) => void
  ): Promise<void> {
    try {
      if (this.isMessageAction<{ sound: NotificationSound }>(message, PREVIEW_SOUND_ACTION.previewSound)) {
        const { sound } = message.payload || { sound: 'ping' };

        this.debugService.log(`[EventService] Playing sound preview: ${sound}`);

        const soundService = this.serviceContainer.getService('soundService');

        // Play the sound (SoundService handles the offscreen document)
        await soundService.playNotificationSound(sound);

        this.debugService.log(`[EventService] Sound preview completed: ${sound}`);
        sendResponse({ success: true, data: `Sound preview played: ${sound}` });
      } else {
        sendResponse({ success: false, error: 'Invalid payload for previewSound' });
      }
    } catch (error) {
      this.debugService.error('[EventService] Error handling sound preview:', error);
      sendResponse({ success: false, error: 'Failed to play sound preview' });
    }
  }

  /**
   * Stops sound preview / offscreen playback (e.g. user deleted a custom sound while previewing).
   */
  async handleStopPreviewSoundAction(
    message: RuntimeMessage,
    sendResponse: (response: MessageResponse) => void
  ): Promise<void> {
    try {
      if (!this.isMessageAction(message, PREVIEW_SOUND_ACTION.stopPreviewSound)) {
        sendResponse({ success: false, error: 'Invalid stopPreviewSound message' });
        return;
      }
      const soundService = this.serviceContainer.getService('soundService');
      await soundService.stopNotificationPlayback();
      sendResponse({ success: true, data: 'Sound preview stopped' });
    } catch (error) {
      this.debugService.error('[EventService] Error stopping sound preview:', error);
      sendResponse({ success: false, error: 'Failed to stop sound preview' });
    }
  }

  /**
   * Routes all devTest:* actions to the DevTestService.
   */
  async handleDevTestActions(
    message: RuntimeMessage,
    sendResponse: (response: MessageResponse) => void
  ): Promise<void> {
    try {
      const devTestService =
        this.serviceContainer.getService('devTestService');

      switch (message.action) {
        case DEV_TEST_ACTION.fireNotification: {
          const overrides = message.payload as DevTestNotificationOverrides | undefined;
          await devTestService.fireTestNotification(overrides);
          sendResponse({ success: true, data: 'Test notification fired' });
          break;
        }
        case DEV_TEST_ACTION.startLoop: {
          const { intervalMs } = (message.payload as { intervalMs: number }) || { intervalMs: 3000 };
          const state = await devTestService.startNotificationLoop(intervalMs);
          sendResponse({ success: true, data: state });
          break;
        }
        case DEV_TEST_ACTION.stopLoop: {
          const state = await devTestService.stopNotificationLoop();
          sendResponse({ success: true, data: state });
          break;
        }
        case DEV_TEST_ACTION.getLooperState: {
          sendResponse({ success: true, data: devTestService.getLooperState() });
          break;
        }
        case DEV_TEST_ACTION.overrideAlarm: {
          const { intervalMs } = (message.payload as { intervalMs: number }) || { intervalMs: 30000 };
          const alarmState = await devTestService.overrideAlarmInterval(intervalMs);
          sendResponse({ success: true, data: alarmState });
          break;
        }
        case DEV_TEST_ACTION.restoreAlarm: {
          const alarmState = await devTestService.restoreAlarmInterval();
          sendResponse({ success: true, data: alarmState });
          break;
        }
        case DEV_TEST_ACTION.getAlarmState: {
          const alarmState = await devTestService.getAlarmOverrideState();
          sendResponse({ success: true, data: alarmState });
          break;
        }
        case DEV_TEST_ACTION.getScraperUrls: {
          sendResponse({ success: true, data: devTestService.getScraperUrls() });
          break;
        }
        default:
          sendResponse({ success: false, error: `Unknown devTest action: ${message.action}` });
      }
    } catch (error) {
      this.debugService.error('[EventService] Error handling devTest action:', error);
      sendResponse({ success: false, error: 'Failed to handle devTest action' });
    }
  }

  /**
   * Type guard to check for a specific action in a message.
   */
  private isMessageAction<TPayload>(
    message: RuntimeMessage,
    action: RequestRuntimeAction
  ): message is RuntimeRequestMessage<TPayload> {
    return message.action === action;
  }

  /**
   * Disposes the event service.
   * NOTE: Chrome event listeners registered in main.ts persist for the
   * lifetime of the service worker and cannot be reliably removed.
   */
  async dispose(): Promise<void> {
    this.debugService.log('[EventService] Event service disposed');
    this.initialized = false;
  }
}
