import type { IService } from './IService';

/**
 * Watches `chrome.permissions.onAdded` / `onRemoved` so the popup outage banner can react to a
 * site-access toggle in chrome://extensions BEFORE the next fetch wave triggers a generic
 * transport failure. The actual reason write happens via `IHealthStatusService`; this watcher is
 * just the event surface.
 */
export type ISiteAccessWatcher = IService;
