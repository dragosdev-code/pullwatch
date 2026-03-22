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
 *
 * ### Async `chrome.*` listeners (alarms, install, startup, notification click)
 * These handlers are `async` and `await` both {@link initPromise} and the full
 * {@link IEventService} handler. The listener therefore returns a Promise that stays
 * pending until that work finishes, which keeps the MV3 service worker tied to the event.
 * Scheduling only `initPromise.then(...)` and returning void ends the synchronous callback
 * immediately; Chrome may idle the worker before fetches or `chrome.notifications` run.
 * Having DevTools open on the service worker masks that by keeping the worker alive longer.
 */

const serviceContainer = new ServiceContainer();
const backgroundManager = new BackgroundManager(serviceContainer);

const initPromise: Promise<void> = backgroundManager.initialize().catch((error) => {
  console.error('[Main] Failed to initialize background script:', error);
});

function getEventService(): IEventService {
  return serviceContainer.getService('eventService');
}

// ─── Synchronous listener registration ───────────────────────────────────────

/**
 * Runs extension install/update setup (permissions, alarm, initial fetch) after shared init.
 * @param details - Chrome install/update reason and previous version when applicable.
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    await initPromise;
    await getEventService().handleInstallation(details);
  } catch (error) {
    console.error('[Main] Error in onInstalled:', error);
  }
});

/** Restores permissions and the fetch alarm when the browser profile starts. */
chrome.runtime.onStartup.addListener(async () => {
  try {
    await initPromise;
    await getEventService().handleStartup();
  } catch (error) {
    console.error('[Main] Error in onStartup:', error);
  }
});

/**
 * Periodic wake: refreshes assigned, merged, and authored PRs (respecting rate-limit backoff).
 * @param alarm - Fired alarm; name is matched to the fetch PRs alarm in EventService.
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  try {
    await initPromise;
    await getEventService().handleAlarm(alarm);
  } catch (error) {
    console.error('[Main] Error in onAlarm:', error);
  }
});

/** Routes notification clicks to the notification service (e.g. clear + future deep-link). */
chrome.notifications.onClicked.addListener(async (notificationId) => {
  try {
    await initPromise;
    await getEventService().handleNotificationClick(notificationId);
  } catch (error) {
    console.error('[Main] Error in onNotificationClick:', error);
  }
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
