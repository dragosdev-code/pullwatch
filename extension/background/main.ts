import { BackgroundManager } from './services/BackgroundManager';
import { ServiceContainer } from './core/ServiceContainer';
import type { IEventService } from './interfaces/IEventService';
import type { RuntimeMessage, MessageResponse } from '../common/types';

/**
 * Main entry point for the background service worker.
 *
 * ### MV3 Service Worker Lifecycle — why this matters
 *
 * Chrome terminates MV3 service workers after ~30 s of inactivity. When an
 * event (alarm, message, etc.) later wakes the worker, this entire file
 * executes **from scratch**: new ServiceContainer, new BackgroundManager,
 * new `initPromise`. There is no persistent `initialized` flag between
 * wakes — every in-memory variable is gone.
 *
 * Opening DevTools on the service worker **masks** this: Chrome keeps the
 * worker alive indefinitely, so the objects created below persist and
 * `BackgroundManager.initialized` stays `true` after the first run.
 * Without DevTools, each wake is a clean slate.
 *
 * ### Which Chrome events fire on which wake types
 *
 * - `onInstalled`  — fires only on extension install or update.
 * - `onStartup`    — fires only when the browser profile starts.
 * - `onAlarm`      — fires on each alarm tick (routine wake).
 * - `onMessage`    — fires when any extension context sends a message.
 *
 * A routine alarm wake does NOT fire `onInstalled` or `onStartup`. This
 * means `performInitialSetup` (called via `initPromise`) is the only code
 * guaranteed to run before every event handler. It must restrict itself to
 * idempotent infrastructure work (permissions, alarms, and
 * `PRService.syncBadgeFromStorage` — badge derived from storage/settings, not from the
 * handler that follows) and must NOT fetch or seed PR data — see
 * BackgroundManager.performInitialSetup for the full explanation.
 *
 * ### Pattern: "Initialization Gate"
 *
 * - Start async init immediately, store the resulting Promise.
 * - Register all listeners synchronously (required by Chrome's wake-up
 *   mechanism — listeners registered after an `await` are invisible).
 * - Inside each listener, `await initPromise` before processing.
 *
 * ### Async `chrome.*` listeners (alarms, install, startup, notification click)
 *
 * These handlers are `async` and `await` both {@link initPromise} and the
 * full {@link IEventService} handler. The returned Promise keeps the MV3
 * service worker alive until the work finishes. Scheduling only
 * `initPromise.then(...)` and returning void would end the synchronous
 * callback immediately; Chrome may idle the worker before fetches or
 * `chrome.notifications` run.
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
