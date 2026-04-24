import type {
  PullRequest,
  ExtensionSettings,
  NotificationSound,
  DevTestNotificationOverrides,
  DevTestLooperState,
  DevTestAlarmOverrideState,
  ScraperUrl,
  RuntimeMessage,
  StoredPRs,
} from './types';
import {
  STORAGE_KEY_ASSIGNED_PRS,
  STORAGE_KEY_AUTHORED_PRS,
  STORAGE_KEY_MERGED_PRS,
  STORAGE_KEY_SETTINGS,
} from './constants';
import {
  DEFAULT_EXTENSION_SETTINGS,
  ensureCompleteSettings,
} from './extension-settings-defaults';
import { runWithTransientStorageRetry } from './transient-storage-retry';
import {
  DEV_TEST_ACTION,
  PR_DATA_ACTION,
  PREVIEW_SOUND_ACTION,
  SETTINGS_ACTION,
  type RequestRuntimeAction,
} from './runtime-actions';

/**
 * WHY [location]: Shared Chrome-extension API surface for popup (Vite), MV3 service worker, and
 * offscreen. Colocated with other cross-context extension modules so workers never import from
 * `src/` for platform APIs.
 *
 * WHY [lint contract]: `no-restricted-globals` exempts only this file for the `chrome` identifier;
 * every other module routes through {@link chromeExtensionService} and the exported types below.
 */

// ─── Re-exported chrome.* types ──────────────────────────────────────────────
// Callers import these instead of referencing `chrome.*` directly, so the
// adapter remains the single file that mentions the `chrome` namespace.

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

// Enum runtime value (used at call sites, not just type positions).
// WHY [guarded]: Tests running under jsdom/node may import this module before `globalThis.chrome`
// is stubbed. The enum itself is just a set of string literals so we fall back to a structurally
// identical object — the real `chrome.runtime.ContextType` replaces it whenever it's available.
export const ExtensionContextType: typeof chrome.runtime.ContextType =
  typeof chrome !== 'undefined' && chrome.runtime?.ContextType
    ? chrome.runtime.ContextType
    : ({
        TAB: 'TAB',
        POPUP: 'POPUP',
        BACKGROUND: 'BACKGROUND',
        OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT',
        SIDE_PANEL: 'SIDE_PANEL',
        DEVELOPER_TOOLS: 'DEVELOPER_TOOLS',
      } as unknown as typeof chrome.runtime.ContextType);

// Listener type aliases.
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

/**
 * Centralized adapter/facade over the `chrome.*` extension APIs. This is the
 * single file allowed to reference the `chrome` namespace; every other file
 * routes through the exported singleton {@link chromeExtensionService}.
 *
 * ## Layers
 *
 * - **Layer A — raw namespace adapters** (`storage`, `runtime`, `alarms`,
 *   `notifications`, `tabs`, `action`, `permissions`, `offscreen`): thin
 *   promisified mirrors of the corresponding `chrome.*` APIs. Types are taken
 *   directly from `@types/chrome`.
 *
 * - **Layer B — popup facade methods** (`fetchFreshAssignedPRs`,
 *   `getSettings`, `saveSettings`, `onMessage`, `onSettingsChange`,
 *   `devTest*`, etc.): existing popup-specific helpers that dispatch actions
 *   to the background service worker or convert raw listeners into the
 *   cleanup-fn pattern preferred by React.
 */
export class ChromeExtensionService {
  /**
   * Checks if we're running in a Chrome extension context. Public so callers
   * outside this file can gate their own logic without importing `chrome.*`.
   */
  isExtensionContext(): boolean {
    return (
      typeof chrome !== 'undefined' &&
      !!chrome.runtime &&
      typeof chrome.runtime.sendMessage === 'function'
    );
  }

  private canReadLocalStorage(): boolean {
    return this.isExtensionContext() && typeof chrome.storage?.local?.get === 'function';
  }

  private canReadSyncStorage(): boolean {
    return this.isExtensionContext() && typeof chrome.storage?.sync?.get === 'function';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  Layer A — raw chrome.* adapters (namespace-grouped)
  // ═══════════════════════════════════════════════════════════════════════════

  readonly storage = {
    local: {
      get: (
        keys?: string | string[] | Record<string, unknown> | null
      ): Promise<Record<string, unknown>> =>
        chrome.storage.local.get(keys ?? null) as Promise<Record<string, unknown>>,
      set: (items: Record<string, unknown>): Promise<void> => chrome.storage.local.set(items),
      remove: (keys: string | string[]): Promise<void> => chrome.storage.local.remove(keys),
      clear: (): Promise<void> => chrome.storage.local.clear(),
      getBytesInUse: (keys?: string | string[] | null): Promise<number> =>
        chrome.storage.local.getBytesInUse(keys ?? null),
    },
    sync: {
      get: (
        keys?: string | string[] | Record<string, unknown> | null
      ): Promise<Record<string, unknown>> =>
        chrome.storage.sync.get(keys ?? null) as Promise<Record<string, unknown>>,
      set: (items: Record<string, unknown>): Promise<void> => chrome.storage.sync.set(items),
      remove: (keys: string | string[]): Promise<void> => chrome.storage.sync.remove(keys),
      clear: (): Promise<void> => chrome.storage.sync.clear(),
    },
    session: {
      get: (
        keys?: string | string[] | Record<string, unknown> | null
      ): Promise<Record<string, unknown>> =>
        chrome.storage.session.get(keys ?? null) as Promise<Record<string, unknown>>,
      set: (items: Record<string, unknown>): Promise<void> => chrome.storage.session.set(items),
      remove: (keys: string | string[]): Promise<void> => chrome.storage.session.remove(keys),
      clear: (): Promise<void> => chrome.storage.session.clear(),
    },
    onChanged: {
      addListener: (listener: StorageChangeListener): void =>
        chrome.storage.onChanged.addListener(listener),
      removeListener: (listener: StorageChangeListener): void =>
        chrome.storage.onChanged.removeListener(listener),
    },
  };

  readonly runtime = {
    sendMessage: <T = unknown>(message: unknown): Promise<T> =>
      chrome.runtime.sendMessage(message) as Promise<T>,
    getManifest: (): RuntimeManifest => chrome.runtime.getManifest(),
    getURL: (path: string): string => chrome.runtime.getURL(path),
    getContexts: (filter: ContextFilter): Promise<ExtensionContext[]> =>
      chrome.runtime.getContexts(filter),
    hasGetContexts: (): boolean => typeof chrome.runtime?.getContexts === 'function',
    onMessage: {
      addListener: (listener: RuntimeMessageListener): void =>
        chrome.runtime.onMessage.addListener(listener as Parameters<
          typeof chrome.runtime.onMessage.addListener
        >[0]),
      removeListener: (listener: RuntimeMessageListener): void =>
        chrome.runtime.onMessage.removeListener(listener as Parameters<
          typeof chrome.runtime.onMessage.removeListener
        >[0]),
    },
    onInstalled: {
      addListener: (listener: InstalledListener): void =>
        chrome.runtime.onInstalled.addListener(listener),
      removeListener: (listener: InstalledListener): void =>
        chrome.runtime.onInstalled.removeListener(listener),
    },
    onStartup: {
      addListener: (listener: StartupListener): void =>
        chrome.runtime.onStartup.addListener(listener),
      removeListener: (listener: StartupListener): void =>
        chrome.runtime.onStartup.removeListener(listener),
    },
  };

  readonly alarms = {
    create: (name: string, alarmInfo: AlarmCreateInfo): Promise<void> =>
      chrome.alarms.create(name, alarmInfo),
    get: (name: string): Promise<Alarm | undefined> => chrome.alarms.get(name),
    getAll: (): Promise<Alarm[]> => chrome.alarms.getAll(),
    clear: (name: string): Promise<boolean> => chrome.alarms.clear(name),
    clearAll: (): Promise<boolean> => chrome.alarms.clearAll(),
    onAlarm: {
      addListener: (listener: AlarmListener): void =>
        chrome.alarms.onAlarm.addListener(listener),
      removeListener: (listener: AlarmListener): void =>
        chrome.alarms.onAlarm.removeListener(listener),
    },
  };

  readonly notifications = {
    create: ((
      idOrOptions: string | NotificationCreateOptions,
      maybeOptions?: NotificationCreateOptions
    ): Promise<string> => {
      if (typeof idOrOptions === 'string') {
        if (!maybeOptions) {
          return Promise.reject(
            new Error('chromeExtensionService.notifications.create: options required')
          );
        }
        return chrome.notifications.create(idOrOptions, maybeOptions);
      }
      return chrome.notifications.create(idOrOptions);
    }) as {
      (notificationId: string, options: NotificationCreateOptions): Promise<string>;
      (options: NotificationCreateOptions): Promise<string>;
    },
    clear: (notificationId: string): Promise<boolean> =>
      chrome.notifications.clear(notificationId),
    getAll: (): Promise<Record<string, boolean>> => chrome.notifications.getAll(),
    getPermissionLevel: (): Promise<NotificationPermissionLevel> =>
      chrome.notifications.getPermissionLevel(),
    onClicked: {
      addListener: (listener: NotificationClickedListener): void =>
        chrome.notifications.onClicked.addListener(listener),
      removeListener: (listener: NotificationClickedListener): void =>
        chrome.notifications.onClicked.removeListener(listener),
    },
  };

  readonly tabs = {
    create: (createProperties: TabCreateProperties): Promise<Tab> =>
      chrome.tabs.create(createProperties),
  };

  readonly action = {
    setBadgeBackgroundColor: (details: BadgeColorDetails): Promise<void> =>
      chrome.action.setBadgeBackgroundColor(details),
    setBadgeTextColor: (details: BadgeColorDetails): Promise<void> =>
      chrome.action.setBadgeTextColor(details),
    setBadgeText: (details: BadgeTextDetails): Promise<void> =>
      chrome.action.setBadgeText(details),
    getBadgeText: (details: TabDetails): Promise<string> => chrome.action.getBadgeText(details),
  };

  readonly permissions = {
    contains: (permissions: PermissionsSpec): Promise<boolean> =>
      chrome.permissions.contains(permissions),
    request: (permissions: PermissionsSpec): Promise<boolean> =>
      chrome.permissions.request(permissions),
  };

  readonly offscreen = {
    isAvailable: (): boolean => typeof chrome.offscreen !== 'undefined',
    createDocument: (parameters: OffscreenCreateParameters): Promise<void> =>
      chrome.offscreen.createDocument(parameters),
    closeDocument: (): Promise<void> => chrome.offscreen.closeDocument(),
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  Layer B — popup facade (business methods, unchanged public API)
  // ═══════════════════════════════════════════════════════════════════════════

  private prsFromStoredEnvelope(value: unknown): PullRequest[] {
    return (value as StoredPRs | undefined)?.prs ?? [];
  }

  private async readPrListKey(storageKey: string): Promise<PullRequest[]> {
    if (!this.canReadLocalStorage()) {
      throw new Error('Extension local storage not available');
    }
    const result = await runWithTransientStorageRetry(() => this.storage.local.get(storageKey));
    return this.prsFromStoredEnvelope(result[storageKey]);
  }

  // ─── PR lists: chrome.storage.local (same envelopes as StorageService / hydrate) ────────────

  /** Snapshot for React Query; does not call the background. */
  readAssignedPrsFromLocalStorage(): Promise<PullRequest[]> {
    return this.readPrListKey(STORAGE_KEY_ASSIGNED_PRS);
  }

  /** @see {@link readAssignedPrsFromLocalStorage} */
  readMergedPrsFromLocalStorage(): Promise<PullRequest[]> {
    return this.readPrListKey(STORAGE_KEY_MERGED_PRS);
  }

  /** @see {@link readAssignedPrsFromLocalStorage} */
  readAuthoredPrsFromLocalStorage(): Promise<PullRequest[]> {
    return this.readPrListKey(STORAGE_KEY_AUTHORED_PRS);
  }

  // ─── Background action dispatch ─────────────────────────────────────────────

  /**
   * Dispatches a `{ action, payload }` envelope to the background service
   * worker and unwraps the `{ success, data, error }` response.
   */
  private dispatchAction<T>(action: RequestRuntimeAction, payload?: unknown): Promise<T> {
    if (!this.isExtensionContext()) {
      return Promise.reject(new Error('Extension context not available'));
    }
    return this.runtime
      .sendMessage<{ success: boolean; data?: T; error?: string }>({ action, payload })
      .then((response) => {
        if (response && response.success) {
          return response.data as T;
        }
        throw new Error(response?.error || `Failed to execute action: ${action}`);
      });
  }

  /**
   * User-initiated refresh: background fetches GitHub, updates storage, reschedules the alarm.
   */
  async fetchFreshAssignedPRs(): Promise<PullRequest[]> {
    return this.dispatchAction<PullRequest[]>(PR_DATA_ACTION.fetchAssignedPRs);
  }

  /** User-initiated merged PR refresh — same as {@link fetchFreshAssignedPRs}. */
  async fetchFreshMergedPRs(): Promise<PullRequest[]> {
    return this.dispatchAction<PullRequest[]>(PR_DATA_ACTION.fetchMergedPRs);
  }

  /** User-initiated authored PR refresh — same as {@link fetchFreshAssignedPRs}. */
  async fetchFreshAuthoredPRs(): Promise<PullRequest[]> {
    return this.dispatchAction<PullRequest[]>(PR_DATA_ACTION.fetchAuthoredPRs);
  }

  /**
   * Loads extension settings from `chrome.storage.sync` using the same merge as
   * `StorageService.getExtensionSettings` in the background script (`ensureCompleteSettings`).
   *
   * WHY [no sendMessage]: Hydrating the popup should not wake the service worker; `getSettings` is
   * on the hot path for every open.
   */
  async getSettings(): Promise<ExtensionSettings> {
    if (!this.canReadSyncStorage()) {
      throw new Error('Extension sync storage not available');
    }
    try {
      const result = await runWithTransientStorageRetry(() =>
        this.storage.sync.get(STORAGE_KEY_SETTINGS)
      );
      const raw = result[STORAGE_KEY_SETTINGS] as ExtensionSettings | undefined;
      return ensureCompleteSettings(raw);
    } catch {
      return DEFAULT_EXTENSION_SETTINGS;
    }
  }

  /**
   * Saves extension settings to Chrome storage (sync).
   * Returns the complete updated settings.
   */
  async saveSettings(settings: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
    return this.dispatchAction<ExtensionSettings>(SETTINGS_ACTION.saveSettings, settings);
  }

  /**
   * Fires a sample system notification and the saved sound for To Review (`assigned`) or Merged.
   */
  async testSettingsNotification(category: 'assigned' | 'merged'): Promise<void> {
    return this.dispatchAction(SETTINGS_ACTION.testSettingsNotification, { category });
  }

  /**
   * Plays a sound preview for the specified notification sound type.
   * Used in settings to let users test sounds before selecting.
   * @param sound - The sound type to preview ('ping', 'bell', or 'off')
   */
  async playSoundPreview(sound: NotificationSound): Promise<void> {
    return this.dispatchAction(PREVIEW_SOUND_ACTION.previewSound, { sound });
  }

  /**
   * Stops any in-flight sound preview in the offscreen audio document.
   */
  async stopSoundPreview(): Promise<void> {
    return this.dispatchAction(PREVIEW_SOUND_ACTION.stopPreviewSound, {});
  }

  /**
   * Sets up a listener for background script messages.
   * Returns a cleanup function suitable for React `useEffect`.
   */
  onMessage(callback: (message: RuntimeMessage) => void): () => void {
    if (!this.isExtensionContext()) {
      return () => {};
    }

    const listener: RuntimeMessageListener = (message) => {
      callback(message as RuntimeMessage);
    };

    this.runtime.onMessage.addListener(listener);

    return () => {
      this.runtime.onMessage.removeListener(listener);
    };
  }

  /**
   * Subscribes to `chrome.storage.onChanged` for the settings key (sync area).
   *
   * WHY [storage vs runtime message]: Any writer that updates `chrome.storage.sync` — including
   * this extension on save and cross-device sync — triggers the same path, without requiring the
   * service worker to broadcast `settingsUpdated`.
   */
  onSettingsChange(callback: (settings: ExtensionSettings) => void): () => void {
    if (!this.isExtensionContext()) {
      return () => {};
    }

    const listener: StorageChangeListener = (changes, areaName) => {
      if (areaName !== 'sync') return;
      const change = changes[STORAGE_KEY_SETTINGS];
      if (!change?.newValue) return;
      callback(ensureCompleteSettings(change.newValue as ExtensionSettings));
    };

    this.storage.onChanged.addListener(listener);

    return () => {
      this.storage.onChanged.removeListener(listener);
    };
  }

  // ─── Dev Test Area ─────────────────────────────────────────────────────

  async devTestFireNotification(overrides?: DevTestNotificationOverrides): Promise<void> {
    return this.dispatchAction(DEV_TEST_ACTION.fireNotification, overrides);
  }

  async devTestStartLoop(intervalMs: number): Promise<DevTestLooperState> {
    return this.dispatchAction<DevTestLooperState>(DEV_TEST_ACTION.startLoop, { intervalMs });
  }

  async devTestStopLoop(): Promise<DevTestLooperState> {
    return this.dispatchAction<DevTestLooperState>(DEV_TEST_ACTION.stopLoop);
  }

  async devTestGetLooperState(): Promise<DevTestLooperState> {
    return this.dispatchAction<DevTestLooperState>(DEV_TEST_ACTION.getLooperState);
  }

  async devTestOverrideAlarm(intervalMs: number): Promise<DevTestAlarmOverrideState> {
    return this.dispatchAction<DevTestAlarmOverrideState>(DEV_TEST_ACTION.overrideAlarm, {
      intervalMs,
    });
  }

  async devTestRestoreAlarm(): Promise<DevTestAlarmOverrideState> {
    return this.dispatchAction<DevTestAlarmOverrideState>(DEV_TEST_ACTION.restoreAlarm);
  }

  async devTestGetAlarmState(): Promise<DevTestAlarmOverrideState> {
    return this.dispatchAction<DevTestAlarmOverrideState>(DEV_TEST_ACTION.getAlarmState);
  }

  async devTestGetScraperUrls(): Promise<ScraperUrl[]> {
    return this.dispatchAction<ScraperUrl[]>(DEV_TEST_ACTION.getScraperUrls);
  }
}

// Export singleton instance
export const chromeExtensionService = new ChromeExtensionService();
