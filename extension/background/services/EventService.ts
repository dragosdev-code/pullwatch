import type { IEventService } from '../interfaces/IEventService';
import type { IDebugService } from '../interfaces/IDebugService';
import type { ServiceContainer } from '../core/ServiceContainer';
import type {
  RuntimeMessage,
  MessageResponse,
  ExtensionSettings,
  PullRequest,
} from '../../common/types';
import {
  EVENT_FETCH_PRS,
  EVENT_PLAY_SOUND,
  EVENT_OFFSCREEN_READY,
  GITHUB_BASE_URL,
  GITHUB_REVIEW_REQUESTS_URL_TEMPLATE,
} from '../../common/constants';
import { IPermissionService } from '../interfaces/IPermissionService';
import { IAlarmService } from '../interfaces/IAlarmService';
import { IPRService } from '../interfaces/IPRService';
import { IBadgeService } from '../interfaces/IBadgeService';
import { INotificationService } from '../interfaces/INotificationService';
import { IStorageService } from '../interfaces/IStorageService';
import { ISoundService } from '../interfaces/ISoundService';

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
   * Initializes the event service and sets up event listeners.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.setupEventListeners();
      this.initialized = true;
      this.debugService.log('[EventService] Event service initialized');
    } catch (error) {
      this.debugService.error('[EventService] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Sets up Chrome extension event listeners.
   */
  async setupEventListeners(): Promise<void> {
    try {
      // Runtime installation and startup events
      chrome.runtime.onInstalled.addListener((details) => {
        this.handleInstallation(details).catch((error) => {
          this.debugService.error('[EventService] Error in onInstalled:', error);
        });
      });

      chrome.runtime.onStartup.addListener(() => {
        this.handleStartup().catch((error) => {
          this.debugService.error('[EventService] Error in onStartup:', error);
        });
      });

      // Alarm events
      chrome.alarms.onAlarm.addListener((alarm) => {
        this.handleAlarm(alarm).catch((error) => {
          this.debugService.error('[EventService] Error in onAlarm:', error);
        });
      });

      // Notification events
      chrome.notifications.onClicked.addListener((notificationId) => {
        this.handleNotificationClick(notificationId).catch((error) => {
          this.debugService.error('[EventService] Error in onNotificationClick:', error);
        });
      });

      // Runtime messages
      chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));

      this.debugService.log('[EventService] Event listeners set up successfully');
    } catch (error) {
      this.debugService.error('[EventService] Error setting up event listeners:', error);
      throw error;
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
        this.debugService.log('[EventService] Fetch alarm triggered');

        // Get PR service and fetch PRs
        const prService = this.serviceContainer.getService<IPRService>('prService');
        await prService.fetchAndUpdateAssignedPRs();
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
        // This specific handler manages its own sendResponse due to callback nature
        this.handleOffscreenActions(message, sendResponse);
        break;
      case EVENT_OFFSCREEN_READY:
        asyncWrapper(this.handleOffscreenActions(message, sendResponse));
        break;

      case 'testNotification':
      case 'testNotificationWithoutPopup':
        asyncWrapper(this.handleTestActions(message, sendResponse));
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

        const storedPRs = await prService.getStoredMergedPRs();
        sendResponse({ success: true, data: storedPRs });

        // Background refresh
        this.fetchFreshMergedDataInBackground(prService, storedPRs);
      } else if (this.isMessageAction(message, 'fetchMergedPRs')) {
        this.debugService.log(
          '[EventService] Manual refresh - fetching fresh merged PRs from GitHub'
        );
        const merged = await prService.updateMergedPRs(true);
        sendResponse({ success: true, data: merged });
      }
    } catch (error) {
      this.debugService.error('[EventService] Error handling merged PR data actions:', error);
      sendResponse({ success: false, error: 'Failed to handle merged PR action' });
    }
  }

  /**
   * Fetches fresh merged data in the background and notifies popup if data changed.
   */
  private async fetchFreshMergedDataInBackground(
    prService: IPRService,
    storedPRs: PullRequest[]
  ): Promise<void> {
    try {
      const fresh = await prService.updateMergedPRs();

      const summarize = (list: PullRequest[]) => list.map((pr) => ({ id: pr.id, title: pr.title }));
      const changed = JSON.stringify(summarize(storedPRs)) !== JSON.stringify(summarize(fresh));

      if (changed) {
        try {
          await chrome.runtime.sendMessage({ action: 'mergedPrDataUpdated', data: fresh });
        } catch (e) {
          this.debugService.log('[EventService] Could not notify popup for merged PRs:', e);
        }
      } else {
        this.debugService.log('[EventService] Background merged fetch completed - no changes');
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
   * Handles test notification actions.
   */
  async handleTestActions(
    message: RuntimeMessage,
    sendResponse: (response: MessageResponse) => void
  ): Promise<void> {
    try {
      const testPR: PullRequest = {
        id: `test-pr-${Date.now()}`,
        url: `${GITHUB_REVIEW_REQUESTS_URL_TEMPLATE(GITHUB_BASE_URL)}/0`,
        title: 'Test PR: This is a Test Notification',
        number: 0,
        repoName: 'test/repo',
        author: { login: 'test-author' },
        createdAt: new Date().toISOString(),
        isNew: true,
        type: 'open',
      };

      if (
        this.isMessageAction(message, 'testNotification') ||
        this.isMessageAction(message, 'testNotificationWithoutPopup')
      ) {
        this.debugService.log(`[EventService] Received ${message.action} message`);

        const notificationService =
          this.serviceContainer.getService<INotificationService>('notificationService');
        await notificationService.showNewPRNotifications(testPR);

        sendResponse({ success: true, data: `Test notification (${message.action}) triggered` });
      }
    } catch (error) {
      this.debugService.error('[EventService] Error handling test actions:', error);
      sendResponse({ success: false, error: 'Failed to handle test action' });
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
   */
  async dispose(): Promise<void> {
    try {
      // Remove event listeners
      // Note: Chrome extension APIs don't provide reliable ways to check if specific listeners exist
      // We'll attempt to remove them and catch any errors
      chrome.runtime.onInstalled.removeListener(this.handleInstallation);
      chrome.runtime.onStartup.removeListener(this.handleStartup);
      chrome.alarms.onAlarm.removeListener(this.handleAlarm);
      chrome.notifications.onClicked.removeListener(this.handleNotificationClick);
      chrome.runtime.onMessage.removeListener(this.handleMessage);

      this.debugService.log('[EventService] Event service disposed');
      this.initialized = false;
    } catch (error) {
      this.debugService.error('[EventService] Error during disposal:', error);
    }
  }
}
