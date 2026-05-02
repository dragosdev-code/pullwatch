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
} from '@common/types';
import {
  SETTINGS_TEST_ERROR_CHROME_DENIED,
  SETTINGS_TEST_ERROR_COOLDOWN,
  SETTINGS_TEST_ERROR_DISABLED,
  STORAGE_KEY_INSTALL_SESSION_CHECK_COMPLETE,
  STORAGE_KEY_PR_FETCH_IN_PROGRESS,
} from '@common/constants';
import { isGitHubWebSessionAuthError } from '@common/errors';
import { ManualPrRefreshCoordinator } from './coordinators/ManualPrRefreshCoordinator';
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
} from '@common/runtime-actions';
import {
  chromeExtensionService,
  type Alarm,
  type InstalledDetails,
  type MessageSender,
} from '@common/chrome-extension-service';

type MessageHandler = (
  message: RuntimeMessage,
  sendResponse: (r: MessageResponse) => void
) => Promise<void> | void;

/**
 * WHY [grouped registration]: Several runtime action strings share one handler; looping keeps the
 * dispatch map typo-resistant and makes that sharing obvious when adding a new action.
 */
function registerDispatchGroup(
  map: Map<RequestRuntimeAction, MessageHandler>,
  handler: MessageHandler,
  ...actions: RequestRuntimeAction[]
): void {
  for (const action of actions) {
    map.set(action, handler);
  }
}

/**
 * EventService coordinates Chrome extension events and handles message routing.
 * Central hub for all extension events, messages, and service coordination.
 */
export class EventService implements IEventService {
  private debugService: IDebugService;
  private serviceContainer: ServiceContainer;
  private initialized = false;
  /**
   * Count of overlapping PR fetch operations (manual messages run in parallel; alarm is one block).
   * WHY [UI flag]: a single boolean per handler would clear `pr_fetch_in_progress` while sibling fetches still run.
   * WHY [identity barrier]: when this returns to 0, {@link withPrUiFetchIndicator} persists viewer identity once —
   * see that method for the account-swap ordering contract with {@link PRService}.
   */
  private prUiFetchDepth = 0;
  private readonly manualRefreshCoordinator: ManualPrRefreshCoordinator;
  private readonly dispatchTable: Map<RequestRuntimeAction, MessageHandler>;

  constructor(debugService: IDebugService, serviceContainer: ServiceContainer) {
    this.debugService = debugService;
    this.serviceContainer = serviceContainer;

    this.manualRefreshCoordinator = new ManualPrRefreshCoordinator({
      debugService,
      serviceContainer,
      withPrUiFetchIndicator: (fn) => this.withPrUiFetchIndicator(fn),
      invalidateGitHubWebSessionAfterAuthFailure: () =>
        this.invalidateGitHubWebSessionAfterAuthFailure(),
      logCatchAsWarningIfAuth: (ctx, err) => this.logCatchAsWarningIfAuth(ctx, err),
    });

    const dispatchTable = new Map<RequestRuntimeAction, MessageHandler>();
    registerDispatchGroup(
      dispatchTable,
      (m, r) => this.handleAssignedPRDataActions(m, r),
      PR_DATA_ACTION.fetchAssignedPRs
    );
    registerDispatchGroup(
      dispatchTable,
      (m, r) => this.handleMergedPRDataActions(m, r),
      PR_DATA_ACTION.fetchMergedPRs
    );
    registerDispatchGroup(
      dispatchTable,
      (m, r) => this.handleAuthoredPRDataActions(m, r),
      PR_DATA_ACTION.fetchAuthoredPRs
    );
    registerDispatchGroup(
      dispatchTable,
      (m, r) => this.handleSettingsActions(m, r),
      SETTINGS_ACTION.saveSettings,
      SETTINGS_ACTION.getSettings,
      SETTINGS_ACTION.testSettingsNotification
    );
    registerDispatchGroup(
      dispatchTable,
      (m, r) => this.handleOffscreenActions(m, r),
      EVENT_PLAY_SOUND,
      EVENT_OFFSCREEN_READY
    );
    registerDispatchGroup(
      dispatchTable,
      (m, r) => this.handlePreviewSoundAction(m, r),
      PREVIEW_SOUND_ACTION.previewSound
    );
    registerDispatchGroup(
      dispatchTable,
      (m, r) => this.handleStopPreviewSoundAction(m, r),
      PREVIEW_SOUND_ACTION.stopPreviewSound
    );
    registerDispatchGroup(
      dispatchTable,
      (m, r) => this.handleDevTestActions(m, r),
      DEV_TEST_ACTION.fireNotification,
      DEV_TEST_ACTION.startLoop,
      DEV_TEST_ACTION.stopLoop,
      DEV_TEST_ACTION.getLooperState,
      DEV_TEST_ACTION.overrideAlarm,
      DEV_TEST_ACTION.restoreAlarm,
      DEV_TEST_ACTION.getAlarmState,
      DEV_TEST_ACTION.getScraperUrls
    );
    this.dispatchTable = dispatchTable;
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
   *
   * WHY [health flags reset]: `clearGitHubWebSessionCaches` removes the persisted health-flag
   * payloads, but {@link HealthStatusService} also keeps in-memory mirrors with single-flag dedupe
   * (see `signalGitHubOutage`/`signalParserBreakage`). If we leave those mirrors set after wipe, a
   * subsequent real fault skips the storage write because the dedupe says "already signaled". Call
   * the clear methods so the in-memory state matches storage and the popup gets a `*Cleared`
   * broadcast.
   */
  private async invalidateGitHubWebSessionAfterAuthFailure(): Promise<void> {
    try {
      const storageService = this.serviceContainer.getService('storageService');
      const badgeService = this.serviceContainer.getService('badgeService');
      const healthStatusService = this.serviceContainer.getService('healthStatusService');
      await storageService.clearGitHubWebSessionCaches();
      await healthStatusService.clearGitHubOutage();
      await healthStatusService.clearParserBreakage();
      await badgeService.setDefaultBadge();
    } catch (err) {
      this.debugService.error('[EventService] GitHub session wipe failed after auth error:', err);
    }
  }

  /**
   * WHY [log level]: `isGitHubWebSessionAuthError` means the browser has no github.com session for
   * this profile — expected until the user signs in — so `warn` keeps support signal on real faults.
   */
  private logCatchAsWarningIfAuth(context: string, error: unknown): void {
    if (isGitHubWebSessionAuthError(error)) {
      this.debugService.warn(`[EventService] ${context}:`, error);
    } else {
      this.debugService.error(`[EventService] ${context}:`, error);
    }
  }

  /**
   * `chrome.runtime.onInstalled` — permissions, fetch alarm, and initial GitHub hydration for the popup.
   *
   * WHY [three lists + barrier]: The UI reads assigned, merged, and authored from `chrome.storage.local`
   * independently; each key must be populated before first paint. `withPrUiFetchIndicator` matches the
   * alarm/manual-refresh contract so `PRService.persistResolvedViewerIdentity` runs once after the whole
   * wave (same depth → `finally` rule as manual refresh).
   */
  async handleInstallation(details: InstalledDetails): Promise<void> {
    try {
      this.debugService.log('[EventService] Handling installation:', details);

      const permissionService = this.serviceContainer.getService('permissionService');
      const alarmService = this.serviceContainer.getService('alarmService');
      const prService = this.serviceContainer.getService('prService');
      const badgeService = this.serviceContainer.getService('badgeService');
      const storageService = this.serviceContainer.getService('storageService');

      await permissionService.checkAllPermissions();
      await alarmService.setupFetchAlarm();

      if (details.reason === 'install') {
        this.debugService.log('[EventService] First install detected');
        // WHY [try/finally wrap]: The popup renders a "checking GitHub session" phase gated on
        // STORAGE_KEY_INSTALL_SESSION_CHECK_COMPLETE. It must settle to `true` even if the install
        // fetch throws — otherwise the popup would hang on the loader until the 12s client-side
        // safety timeout. The flag-set itself is wrapped in inner try/catch so a storage failure
        // never masks the original fetch error propagating to the outer handler.
        try {
          await storageService.remove(STORAGE_KEY_INSTALL_SESSION_CHECK_COMPLETE);
          await badgeService.setLoadingBadge();
          await this.withPrUiFetchIndicator(async () => {
            prService.beginPrListHealthWave();
            await prService.fetchAndUpdateAssignedPRs(true, true);
            await prService.updateMergedPRs(true, true);
            await prService.updateAuthoredPRs(true, true);
          });
        } finally {
          try {
            await storageService.set(STORAGE_KEY_INSTALL_SESSION_CHECK_COMPLETE, true);
          } catch (flagErr) {
            this.debugService.error(
              '[EventService] Failed to persist install-check flag:',
              flagErr
            );
          }
        }
      } else {
        if (details.reason === 'update') {
          this.debugService.log('[EventService] Extension updated');
        }
        // WHY [forceRefresh only on install]: `false` here matches the periodic alarm so version
        // bumps behave as a plain refresh; install-time forceRefresh lives in the branch above.
        await this.withPrUiFetchIndicator(async () => {
          prService.beginPrListHealthWave();
          await prService.fetchAndUpdateAssignedPRs(false, true);
          await prService.updateMergedPRs(false, true);
          await prService.updateAuthoredPRs(false, true);
        });
      }
    } catch (error) {
      this.logCatchAsWarningIfAuth('Error handling installation', error);
    }
  }

  /**
   * Service worker wake / browser startup — re-arm alarms and refill storage before the popup reads it.
   *
   * WHY [`forceRefresh` + `bypassCache` on all three]: After an MV3 sleep or browser restart, TTL cache
   * in `PRService` could otherwise serve empty or stale slices; `true, true` forces a GitHub round-trip
   * for every list under the same identity barrier as the periodic `EVENT_FETCH_PRS` alarm path.
   */
  async handleStartup(): Promise<void> {
    try {
      this.debugService.log('[EventService] Handling startup');

      // Get services directly from container
      const permissionService = this.serviceContainer.getService('permissionService');
      const alarmService = this.serviceContainer.getService('alarmService');
      const prService = this.serviceContainer.getService('prService');

      // Handle startup logic
      await permissionService.checkAllPermissions();
      await alarmService.setupFetchAlarm();
      await this.withPrUiFetchIndicator(async () => {
        prService.beginPrListHealthWave();
        await prService.fetchAndUpdateAssignedPRs(true, true);
        await prService.updateMergedPRs(true, true);
        await prService.updateAuthoredPRs(true, true);
      });
    } catch (error) {
      this.logCatchAsWarningIfAuth('Error handling startup', error);
    }
  }

  /**
   * Handles alarm events.
   */
  async handleAlarm(alarm: Alarm): Promise<void> {
    try {
      this.debugService.log('[EventService] Handling alarm:', alarm.name);

      if (alarm.name === EVENT_FETCH_PRS) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          this.debugService.log('[EventService] Skipping fetch - device appears offline');
          return;
        }

        const rateLimitService = this.serviceContainer.getService('rateLimitService');
        if (rateLimitService.shouldSkipFetch()) {
          this.debugService.log('[EventService] Skipping fetch - rate limited (backoff active)');
          return;
        }

        this.debugService.log('[EventService] Fetch alarm triggered - fetching all PR types');

        const prService = this.serviceContainer.getService('prService');
        const gitHubStatusClient = this.serviceContainer.getService('gitHubStatusClient');
        const alarmSeqClock = this.serviceContainer.getService('alarmSeqClock');

        // WHY [bypassCache]: Alarm spacing is the rate limiter — each tick should hit GitHub, not the
        // short TTL cache in `PRService`. Same `withPrUiFetchIndicator` wrapper as install/startup so
        // depth hits zero once and `persistResolvedViewerIdentity` stays ordered with the full wave.
        // WHY [single Statuspage fetch per wave]: assess() runs once per list; without a shared
        // snapshot we either burn three network calls (bypass each call) or miss a freshly flipped
        // degraded status (cache each call). Prefetching with bypass also overwrites the cache so
        // any incidental same-wave non-bypass read hits the refreshed entry.
        await this.withPrUiFetchIndicator(async () => {
          const waveStatus = await gitHubStatusClient.getStatus({ bypassCache: true });
          prService.beginPrListHealthWave();
          await prService.fetchAndUpdateAssignedPRs(false, true, waveStatus);
          await prService.updateMergedPRs(false, true, waveStatus);
          await prService.updateAuthoredPRs(false, true, waveStatus);
        });

        // WHY [advance after persist]: tombstone window is anchored to alarm waves; advancing here
        // (only here — not in manual refresh) means the next wave's findResurrected sees this
        // wave's drops as "1 alarm ago", giving the configured 4-wave window. Advancing before the
        // wave would tombstone keys at seq N+1 even though they dropped during seq N.
        await alarmSeqClock.advance();

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
      const notificationService = this.serviceContainer.getService('notificationService');
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
    _sender: MessageSender,
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
   * Assigned `fetch*` action: user-initiated refresh — GitHub + storage + alarm pushback.
   * The popup reads the persisted list from `chrome.storage.local` directly (no SW wake).
   */
  async handleAssignedPRDataActions(
    message: RuntimeMessage,
    sendResponse: (response: MessageResponse) => void
  ): Promise<void> {
    if (!this.isMessageAction(message, PR_DATA_ACTION.fetchAssignedPRs)) return;
    return this.manualRefreshCoordinator.run('assigned', sendResponse);
  }

  /**
   * Merged `fetch*` action — same contract as {@link handleAssignedPRDataActions}.
   */
  async handleMergedPRDataActions(
    message: RuntimeMessage,
    sendResponse: (response: MessageResponse) => void
  ): Promise<void> {
    if (!this.isMessageAction(message, PR_DATA_ACTION.fetchMergedPRs)) return;
    return this.manualRefreshCoordinator.run('merged', sendResponse);
  }

  /**
   * Mirrors in-flight PR work to `STORAGE_KEY_PR_FETCH_IN_PROGRESS` so the popup can show “Updating…”
   * without React Query driving fetches from the panel.
   *
   * WHY [depth + identity]: Manual refresh sends three runtime messages — each handler nests here, so
   * {@link prUiFetchDepth} can reach 3 and unwind in arbitrary order. `PRService` compares HTML-derived
   * login to `github_viewer_identity` for account-swap; persisting identity when the *first* sibling
   * finished would let later siblings read baseline === current and miss a swap. `persistResolvedViewerIdentity`
   * therefore runs only when depth returns to **0**.
   *
   * WHY [alarm / install / startup]: A single nested callback (depth 1) runs assigned → merged → authored
   * sequentially; same persist-on-zero contract so install-time hydration matches manual refresh semantics.
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
   * Authored `fetch*` action — same contract as {@link handleAssignedPRDataActions}.
   */
  async handleAuthoredPRDataActions(
    message: RuntimeMessage,
    sendResponse: (response: MessageResponse) => void
  ): Promise<void> {
    if (!this.isMessageAction(message, PR_DATA_ACTION.fetchAuthoredPRs)) return;
    return this.manualRefreshCoordinator.run('authored', sendResponse);
  }

  /**
   * Back-compat accessor for tests that probe wave state without reaching into the coordinator.
   * Kept readable so existing suites (`manual-refresh-throttle.test.ts`) keep working unchanged.
   */
  get manualRefreshWaveActive(): boolean {
    return this.manualRefreshCoordinator.manualRefreshWaveActive;
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
        if (!payload || (payload.category !== 'assigned' && payload.category !== 'merged')) {
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
              err.message === SETTINGS_TEST_ERROR_DISABLED ||
              err.message === SETTINGS_TEST_ERROR_CHROME_DENIED)
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
      await chromeExtensionService.runtime.sendMessage({
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
   *
   * WHY [gate]: `EVENT_PLAY_SOUND` is routed through `SoundService.playNotificationSound` rather
   * than forwarding the message directly to the offscreen document. `SoundService` owns a FIFO
   * promise gate that serializes concurrent playback requests; bypassing it would let overlapping
   * messages produce simultaneous audio.
   */
  async handleOffscreenActions(
    message: RuntimeMessage,
    sendResponse: (response: MessageResponse) => void
  ): Promise<void> {
    try {
      if (this.isMessageAction(message, EVENT_PLAY_SOUND)) {
        const soundService = this.serviceContainer.getService('soundService');
        const payload = message.payload as { soundType?: string } | undefined;
        const sound = (payload?.soundType ?? 'ping') as NotificationSound;

        await soundService.playNotificationSound(sound);

        sendResponse({ success: true, data: `Sound played: ${sound}` });
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
      if (
        this.isMessageAction<{ sound: NotificationSound }>(
          message,
          PREVIEW_SOUND_ACTION.previewSound
        )
      ) {
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
      const devTestService = this.serviceContainer.getService('devTestService');

      switch (message.action) {
        case DEV_TEST_ACTION.fireNotification: {
          const overrides = message.payload as DevTestNotificationOverrides | undefined;
          await devTestService.fireTestNotification(overrides);
          sendResponse({ success: true, data: 'Test notification fired' });
          break;
        }
        case DEV_TEST_ACTION.startLoop: {
          const { intervalMs } = (message.payload as { intervalMs: number }) || {
            intervalMs: 3000,
          };
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
          const { intervalMs } = (message.payload as { intervalMs: number }) || {
            intervalMs: 30000,
          };
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
