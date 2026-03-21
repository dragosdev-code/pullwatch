import type { IEventService } from '../interfaces/IEventService';
import type { IDebugService } from '../interfaces/IDebugService';
import type { ServiceContainer } from '../core/ServiceContainer';
import type {
  RuntimeMessage,
  MessageResponse,
  ExtensionSettings,
  PullRequest,
  NotificationSound,
  DevTestNotificationOverrides,
} from '../../common/types';
import {
  EVENT_FETCH_PRS,
  EVENT_PLAY_SOUND,
  EVENT_OFFSCREEN_READY,
} from '../../common/constants';
import { IPermissionService } from '../interfaces/IPermissionService';
import { IAlarmService } from '../interfaces/IAlarmService';
import { IPRService } from '../interfaces/IPRService';
import { IBadgeService } from '../interfaces/IBadgeService';
import { INotificationService } from '../interfaces/INotificationService';
import { IStorageService } from '../interfaces/IStorageService';
import { ISoundService } from '../interfaces/ISoundService';
import { IDevTestService } from '../interfaces/IDevTestService';
import { IRateLimitService } from '../interfaces/IRateLimitService';

/**
 * EventService coordinates Chrome extension events and handles message routing.
 * Central hub for all extension events, messages, and service coordination.
 */
export class EventService implements IEventService {
  private debugService: IDebugService;
  private serviceContainer: ServiceContainer;
  private initialized = false;

  constructor(debugService: IDebugService, serviceContainer: ServiceContainer) {
    this.debugService = debugService;
    this.serviceContainer = serviceContainer;
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
   * Handles extension installation and updates.
   */
  async handleInstallation(details: chrome.runtime.InstalledDetails): Promise<void> {
    try {
      this.debugService.log('[EventService] Handling installation:', details);

      // Get services directly from container
      const permissionService =
        this.serviceContainer.getService<IPermissionService>('permissionService');
      const alarmService = this.serviceContainer.getService<IAlarmService>('alarmService');
      const prService = this.serviceContainer.getService<IPRService>('prService');
      const badgeService = this.serviceContainer.getService<IBadgeService>('badgeService');

      // Handle installation logic
      await permissionService.checkAllPermissions();
      await alarmService.setupFetchAlarm();

      if (details.reason === 'install') {
        this.debugService.log('[EventService] First install detected');
        await badgeService.setLoadingBadge();
      } else if (details.reason === 'update') {
        this.debugService.log('[EventService] Extension updated');
      }

      // Perform initial fetch after installation/update
      await prService.fetchAndUpdateAssignedPRs(true);
    } catch (error) {
      this.debugService.error('[EventService] Error handling installation:', error);
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
        this.serviceContainer.getService<IPermissionService>('permissionService');
      const alarmService = this.serviceContainer.getService<IAlarmService>('alarmService');
      const prService = this.serviceContainer.getService<IPRService>('prService');

      // Handle startup logic
      await permissionService.checkAllPermissions();
      await alarmService.setupFetchAlarm();
      await prService.fetchAndUpdateAssignedPRs(true);
    } catch (error) {
      this.debugService.error('[EventService] Error handling startup:', error);
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
          this.serviceContainer.getService<IRateLimitService>('rateLimitService');
        if (rateLimitService.shouldSkipFetch()) {
          this.debugService.log('[EventService] Skipping fetch - rate limited (backoff active)');
          return;
        }

        this.debugService.log('[EventService] Fetch alarm triggered - fetching all PR types');

        const prService = this.serviceContainer.getService<IPRService>('prService');

        // Always bypass cache for alarm-triggered fetches.
        // The alarm interval itself is the rate limiter; the cache exists to
        // prevent double-fetching when the popup opens shortly after an alarm.
        await prService.fetchAndUpdateAssignedPRs(false, true);
        await prService.updateMergedPRs(false, true);
        await prService.updateAuthoredPRs(false, true);

        this.debugService.log('[EventService] Completed alarm fetch for all PR types');
      } else {
        this.debugService.warn('[EventService] Unknown alarm triggered:', alarm.name);
      }
    } catch (error) {
      this.debugService.error('[EventService] Error handling alarm:', error);
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
        this.serviceContainer.getService<INotificationService>('notificationService');
      await notificationService.handleNotificationClick(notificationId);
    } catch (error) {
      this.debugService.error('[EventService] Error handling notification click:', error);
    }
  }

  /**
   * Main message handler for all Chrome extension messages.
   */
  handleMessage(
    message: RuntimeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ): boolean {
    this.debugService.log('[EventService] Received message:', message, 'from sender:', sender);

    const action = message.action;
    let unhandled = false;

    // Wrap async calls to ensure errors are caught and sendResponse is called
    const asyncWrapper = (fn: Promise<void>) => {
      fn.catch((err) => {
        this.debugService.error(`[EventService] Error in async handler for action ${action}:`, err);
        try {
          sendResponse({ success: false, error: `Unhandled error in ${action} handler` });
        } catch (e) {
          this.debugService.error('[EventService] Failed to send error response:', e);
        }
      });
    };

    switch (action) {
      case 'getAssignedPRs':
      case 'fetchAssignedPRs':
        asyncWrapper(this.handleAssignedPRDataActions(message, sendResponse));
        break;
      case 'getMergedPRs':
      case 'fetchMergedPRs':
        asyncWrapper(this.handleMergedPRDataActions(message, sendResponse));
        break;
      case 'getAuthoredPRs':
      case 'fetchAuthoredPRs':
        asyncWrapper(this.handleAuthoredPRDataActions(message, sendResponse));
        break;

      case 'saveSettings':
      case 'getSettings':
        asyncWrapper(this.handleSettingsActions(message, sendResponse));
        break;

      case EVENT_PLAY_SOUND:
        this.handleOffscreenActions(message, sendResponse);
        break;
      case EVENT_OFFSCREEN_READY:
        asyncWrapper(this.handleOffscreenActions(message, sendResponse));
        break;

      case 'previewSound':
        asyncWrapper(this.handlePreviewSoundAction(message, sendResponse));
        break;


      case 'devTest:fireNotification':
      case 'devTest:startLoop':
      case 'devTest:stopLoop':
      case 'devTest:getLooperState':
      case 'devTest:overrideAlarm':
      case 'devTest:restoreAlarm':
      case 'devTest:getAlarmState':
      case 'devTest:getScraperUrls':
        asyncWrapper(this.handleDevTestActions(message, sendResponse));
        break;

      default:
        unhandled = true;
        this.debugService.warn('[EventService] Unhandled message action:', action);
        sendResponse({ success: false, error: `Unknown action: ${action}` });
        break;
    }

    // Return true to indicate that sendResponse will be (or has been) called asynchronously
    return !unhandled;
  }

  /**
   * Handles assigned PR data related actions (getAssignedPRs, fetchAssignedPRs).
   */
  async handleAssignedPRDataActions(
    message: RuntimeMessage,
    sendResponse: (response: MessageResponse) => void
  ): Promise<void> {
    try {
      const prService = this.serviceContainer.getService<IPRService>('prService');

      if (this.isMessageAction(message, 'getAssignedPRs')) {
        this.debugService.log('[EventService] Getting stored assigned PRs and fetching fresh data');

        // 1. Get stored PRs immediately for fast response
        const storedPRs = await prService.getStoredAssignedPRs();
        this.debugService.log(`[EventService] getStoredAssignedPRs returned ${storedPRs.length} PRs`);

        // 2. Send stored PRs immediately
        const response = { success: true, data: storedPRs };
        this.debugService.log(`[EventService] Sending immediate response with stored assigned PRs`);
        sendResponse(response);

        // 3. Fetch fresh data in background (don't wait for response)
        this.fetchFreshDataInBackground(prService);
      } else if (this.isMessageAction(message, 'fetchAssignedPRs')) {
        // fetchAssignedPRs: Fetch fresh data from GitHub and update storage (manual refresh)
        this.debugService.log('[EventService] Manual refresh - fetching fresh assigned PRs from GitHub');
        const prs = await prService.fetchAndUpdateAssignedPRs(true); // force refresh
        this.debugService.log(`[EventService] fetchAndUpdateAssignedPRs returned ${prs.length} PRs`);

        const response = { success: true, data: prs };
        this.debugService.log(`[EventService] Sending response with fresh assigned PRs`);
        sendResponse(response);
      }
    } catch (error) {
      this.debugService.error('[EventService] Error handling assigned PR data actions:', error);
      sendResponse({ success: false, error: 'Failed to handle assigned PR action' });
    }
  }

  /**
   * Handles merged PR data related actions (getMergedPRs, fetchMergedPRs).
   */
  async handleMergedPRDataActions(
    message: RuntimeMessage,
    sendResponse: (response: MessageResponse) => void
  ): Promise<void> {
    try {
      const prService = this.serviceContainer.getService<IPRService>('prService');

      if (this.isMessageAction(message, 'getMergedPRs')) {
        this.debugService.log('[EventService] Getting stored merged PRs and fetching fresh data');

        // 1. Get stored merged PRs immediately for fast response
        const storedPRs = await prService.getStoredMergedPRs();
        this.debugService.log(`[EventService] getStoredMergedPRs returned ${storedPRs.length} PRs`);

        // 2. Send stored PRs immediately
        sendResponse({ success: true, data: storedPRs });

        // 3. Fetch fresh data in background (don't wait for response)
        this.fetchFreshMergedDataInBackground(prService, storedPRs);
      } else if (this.isMessageAction(message, 'fetchMergedPRs')) {
        this.debugService.log(
          '[EventService] Manual refresh - fetching fresh merged PRs from GitHub'
        );
        const merged = await prService.updateMergedPRs(true); // force refresh
        this.debugService.log(`[EventService] updateMergedPRs returned ${merged.length} PRs`);
        sendResponse({ success: true, data: merged });
      }
    } catch (error) {
      this.debugService.error('[EventService] Error handling merged PR data actions:', error);
      sendResponse({ success: false, error: 'Failed to handle merged PR action' });
    }
  }

  /**
   * Fetches fresh merged data in the background and notifies popup if data changed.
   * Delegates business logic to PRService, including notification handling.
   */
  private async fetchFreshMergedDataInBackground(
    prService: IPRService,
    storedPRs: PullRequest[]
  ): Promise<void> {
    try {
      this.debugService.log('[EventService] Background merged PR fetch started');

      // Delegate fetching + storage + notifications to PRService
      const freshPRs = await prService.updateMergedPRs();

      // Check if there are any changes (excluding the isNew flag)
      const summarize = (list: PullRequest[]) =>
        list.map((pr) => ({ id: pr.id, title: pr.title }));

      const hasChanges =
        JSON.stringify(summarize(storedPRs)) !== JSON.stringify(summarize(freshPRs));

      if (hasChanges) {
        this.debugService.log(
          '[EventService] Background merged PR fetch detected changes, notifying popup'
        );

        // Send message to popup to update its display
        try {
          await chrome.runtime.sendMessage({
            action: 'mergedPrDataUpdated',
            data: freshPRs,
          });
        } catch (messageError) {
          // Popup might be closed - that's ok, just log it
          this.debugService.log(
            '[EventService] Could not notify popup for merged PRs (likely closed):',
            messageError
          );
        }
      } else {
        this.debugService.log(
          '[EventService] Background merged PR fetch completed - no changes detected'
        );
      }
    } catch (error) {
      this.debugService.error('[EventService] Error in background merged fetch:', error);
    }
  }

  /**
   * Handles authored PR data related actions (getAuthoredPRs, fetchAuthoredPRs).
   */
  async handleAuthoredPRDataActions(
    message: RuntimeMessage,
    sendResponse: (response: MessageResponse) => void
  ): Promise<void> {
    try {
      const prService = this.serviceContainer.getService<IPRService>('prService');

      if (this.isMessageAction(message, 'getAuthoredPRs')) {
        this.debugService.log('[EventService] Getting stored authored PRs and fetching fresh data');

        const storedPRs = await prService.getStoredAuthoredPRs();
        sendResponse({ success: true, data: storedPRs });

        // Background refresh
        this.fetchFreshAuthoredDataInBackground(prService, storedPRs);
      } else if (this.isMessageAction(message, 'fetchAuthoredPRs')) {
        this.debugService.log(
          '[EventService] Manual refresh - fetching fresh authored PRs from GitHub'
        );
        const authored = await prService.updateAuthoredPRs(true);
        sendResponse({ success: true, data: authored });
      }
    } catch (error) {
      this.debugService.error('[EventService] Error handling authored PR data actions:', error);
      sendResponse({ success: false, error: 'Failed to handle authored PR action' });
    }
  }

  /**
   * Fetches fresh authored data in the background and notifies popup if data changed.
   */
  private async fetchFreshAuthoredDataInBackground(
    prService: IPRService,
    storedPRs: PullRequest[]
  ): Promise<void> {
    try {
      const fresh = await prService.updateAuthoredPRs();

      const summarize = (list: PullRequest[]) => list.map((pr) => ({ id: pr.id, title: pr.title }));
      const changed = JSON.stringify(summarize(storedPRs)) !== JSON.stringify(summarize(fresh));

      if (changed) {
        try {
          await chrome.runtime.sendMessage({ action: 'authoredPrDataUpdated', data: fresh });
        } catch (e) {
          this.debugService.log('[EventService] Could not notify popup for authored PRs:', e);
        }
      } else {
        this.debugService.log('[EventService] Background authored fetch completed - no changes');
      }
    } catch (error) {
      this.debugService.error('[EventService] Error in background authored fetch:', error);
    }
  }

  /**
   * Fetches fresh assigned PR data in the background and notifies popup if data changed.
   * Delegates all business logic to PRService.
   */
  private async fetchFreshDataInBackground(prService: IPRService): Promise<void> {
    try {
      this.debugService.log('[EventService] Background assigned PR fetch started');

      // Get current stored PRs for comparison before fetching
      const storedPRs = await prService.getStoredAssignedPRs();

      // Delegate fetching + storage + badge + notifications to PRService
      const freshPRs = await prService.fetchAndUpdateAssignedPRs();

      // Check if there are any changes
      const summarize = (list: PullRequest[]) =>
        list.map((pr) => ({ id: pr.id, title: pr.title, reviewStatus: pr.reviewStatus }));

      const hasChanges =
        JSON.stringify(summarize(storedPRs)) !== JSON.stringify(summarize(freshPRs));

      if (hasChanges) {
        this.debugService.log(
          '[EventService] Background assigned PR fetch detected changes, notifying popup'
        );

        // Send message to popup to update its display
        try {
          await chrome.runtime.sendMessage({
            action: 'assignedPrDataUpdated',
            data: freshPRs,
          });
        } catch (messageError) {
          // Popup might be closed - that's ok, just log it
          this.debugService.log(
            '[EventService] Could not notify popup (likely closed):',
            messageError
          );
        }
      } else {
        this.debugService.log(
          '[EventService] Background assigned PR fetch completed - no changes detected'
        );
      }
    } catch (error) {
      this.debugService.error('[EventService] Error in background assigned PR fetch:', error);
    }
  }

  /**
   * Handles settings related actions (saveSettings, getSettings).
   */
  async handleSettingsActions(
    message: RuntimeMessage,
    sendResponse: (response: MessageResponse) => void
  ): Promise<void> {
    try {
      const storageService = this.serviceContainer.getService<IStorageService>('storageService');

      if (this.isMessageAction<Partial<ExtensionSettings>>(message, 'saveSettings')) {
        if (message.payload) {
          await storageService.setExtensionSettings(message.payload);
          const settings = await storageService.getExtensionSettings();

          // Notify all open popups that settings have changed
          this.broadcastSettingsUpdate(settings);

          sendResponse({ success: true, data: settings });
        } else {
          sendResponse({ success: false, error: 'No settings payload provided' });
        }
      } else if (this.isMessageAction(message, 'getSettings')) {
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
        action: 'settingsUpdated',
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
        const soundService = this.serviceContainer.getService<ISoundService>('soundService');

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
      if (this.isMessageAction<{ sound: NotificationSound }>(message, 'previewSound')) {
        const { sound } = message.payload || { sound: 'ping' };

        this.debugService.log(`[EventService] Playing sound preview: ${sound}`);

        const soundService = this.serviceContainer.getService<ISoundService>('soundService');

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
   * Routes all devTest:* actions to the DevTestService.
   */
  async handleDevTestActions(
    message: RuntimeMessage,
    sendResponse: (response: MessageResponse) => void
  ): Promise<void> {
    try {
      const devTestService =
        this.serviceContainer.getService<IDevTestService>('devTestService');

      switch (message.action) {
        case 'devTest:fireNotification': {
          const overrides = message.payload as DevTestNotificationOverrides | undefined;
          await devTestService.fireTestNotification(overrides);
          sendResponse({ success: true, data: 'Test notification fired' });
          break;
        }
        case 'devTest:startLoop': {
          const { intervalMs } = (message.payload as { intervalMs: number }) || { intervalMs: 3000 };
          const state = await devTestService.startNotificationLoop(intervalMs);
          sendResponse({ success: true, data: state });
          break;
        }
        case 'devTest:stopLoop': {
          const state = await devTestService.stopNotificationLoop();
          sendResponse({ success: true, data: state });
          break;
        }
        case 'devTest:getLooperState': {
          sendResponse({ success: true, data: devTestService.getLooperState() });
          break;
        }
        case 'devTest:overrideAlarm': {
          const { intervalMs } = (message.payload as { intervalMs: number }) || { intervalMs: 30000 };
          const alarmState = await devTestService.overrideAlarmInterval(intervalMs);
          sendResponse({ success: true, data: alarmState });
          break;
        }
        case 'devTest:restoreAlarm': {
          const alarmState = await devTestService.restoreAlarmInterval();
          sendResponse({ success: true, data: alarmState });
          break;
        }
        case 'devTest:getAlarmState': {
          const alarmState = await devTestService.getAlarmOverrideState();
          sendResponse({ success: true, data: alarmState });
          break;
        }
        case 'devTest:getScraperUrls': {
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
  private isMessageAction<T>(
    message: RuntimeMessage,
    action: string
  ): message is RuntimeMessage<T> {
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
