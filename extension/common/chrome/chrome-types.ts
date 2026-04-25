/**
 * Type-only re-exports for `chrome.*` namespaces and listener signatures.
 *
 * WHY [type-only]: Pure type module with no runtime code, so any caller can import these without
 * touching the `chrome` global. Adapters and clients consume these types; UI code uses them only
 * indirectly through the {@link chromeExtensionService} singleton.
 */

// ─── Re-exported chrome.* types ──────────────────────────────────────────────

export type StorageChange = chrome.storage.StorageChange;
export type StorageAreaName = chrome.storage.AreaName;
export type MessageSender = chrome.runtime.MessageSender;
export type InstalledDetails = chrome.runtime.InstalledDetails;
export type Alarm = chrome.alarms.Alarm;
export type AlarmCreateInfo = chrome.alarms.AlarmCreateInfo;
export type NotificationCreateOptions = chrome.notifications.NotificationCreateOptions;
export type NotificationPermissionLevel = 'granted' | 'denied';
export type ExtensionContext = chrome.runtime.ExtensionContext;
export type ContextFilter = chrome.runtime.ContextFilter;
export type RuntimeManifest = chrome.runtime.Manifest;
export type OffscreenCreateParameters = chrome.offscreen.CreateParameters;
export type OffscreenReason = chrome.offscreen.Reason;
export type BadgeColorDetails = chrome.action.BadgeColorDetails;
export type BadgeTextDetails = chrome.action.BadgeTextDetails;
export type TabDetails = chrome.action.TabDetails;
export type PermissionsSpec = chrome.permissions.Permissions;
export type TabCreateProperties = chrome.tabs.CreateProperties;
export type Tab = chrome.tabs.Tab;

// ─── Listener type aliases ───────────────────────────────────────────────────

export type StorageChangeListener = (
  changes: Record<string, StorageChange>,
  areaName: StorageAreaName
) => void;
export type RuntimeMessageListener = (
  message: unknown,
  sender: MessageSender,
  sendResponse: (response?: unknown) => void
) => boolean | void | Promise<unknown>;
export type InstalledListener = (details: InstalledDetails) => void | Promise<void>;
export type StartupListener = () => void | Promise<void>;
export type AlarmListener = (alarm: Alarm) => void | Promise<void>;
export type NotificationClickedListener = (notificationId: string) => void | Promise<void>;
