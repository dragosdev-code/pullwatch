import { BackgroundManager } from './services/BackgroundManager';
import { ServiceContainer } from './core/ServiceContainer';
import type { IEventService } from './interfaces/IEventService';
import type { RuntimeMessage, MessageResponse } from '../common/types';

/**
 * Main entry point for the background service worker.
 *
 * CRITICAL: All Chrome event listeners MUST be registered synchronously during
 * the first execution tick of the service worker script. Chrome uses synchronous
 * listener registration to decide which events can wake the worker. Listeners
 * registered after an `await` are invisible to Chrome's wake-up mechanism and
 * will cause events (alarms, messages, etc.) to be silently dropped.
 *
 * Pattern used: "Initialization Gate"
 * - Start async init immediately, store the resulting Promise.
 * - Register all listeners synchronously.
 * - Inside each listener, await the init Promise before processing.
 */

const serviceContainer = new ServiceContainer();
const backgroundManager = new BackgroundManager(serviceContainer);

const initPromise: Promise<void> = backgroundManager.initialize().catch((error) => {
  console.error('[Main] Failed to initialize background script:', error);
});

function getEventService(): IEventService {
  return serviceContainer.getService<IEventService>('eventService');
}

// ─── Synchronous listener registration ───────────────────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  initPromise
    .then(() => getEventService().handleInstallation(details))
    .catch((error) => console.error('[Main] Error in onInstalled:', error));
});

chrome.runtime.onStartup.addListener(() => {
  initPromise
    .then(() => getEventService().handleStartup())
    .catch((error) => console.error('[Main] Error in onStartup:', error));
});

chrome.alarms.onAlarm.addListener((alarm) => {
  initPromise
    .then(() => getEventService().handleAlarm(alarm))
    .catch((error) => console.error('[Main] Error in onAlarm:', error));
});

chrome.notifications.onClicked.addListener((notificationId) => {
  initPromise
    .then(() => getEventService().handleNotificationClick(notificationId))
    .catch((error) => console.error('[Main] Error in onNotificationClick:', error));
});

chrome.runtime.onMessage.addListener(
  (
    message: RuntimeMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ): boolean => {
    initPromise
      .then(() => {
        const eventService = getEventService();
        eventService.handleMessage(message, sender, sendResponse);
      })
      .catch((error) => {
        console.error('[Main] Error in onMessage:', error);
        sendResponse({ success: false, error: 'Background initialization failed' });
      });

    // Always return true to keep the sendResponse channel open for async handling
    return true;
  }
);
