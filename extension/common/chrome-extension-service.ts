import { isExtensionContext } from './chrome/chrome-globals';
import { makeStorageAdapter } from './chrome/adapters/storage-adapter';
import { makeRuntimeAdapter } from './chrome/adapters/runtime-adapter';
import { makeAlarmsAdapter } from './chrome/adapters/alarms-adapter';
import { makeNotificationsAdapter } from './chrome/adapters/notifications-adapter';
import { makeTabsAdapter } from './chrome/adapters/tabs-adapter';
import { makeActionAdapter } from './chrome/adapters/action-adapter';
import { makePermissionsAdapter } from './chrome/adapters/permissions-adapter';
import { makeOffscreenAdapter } from './chrome/adapters/offscreen-adapter';
import { BackgroundActionClient } from './chrome/clients/background-action-client';
import { PrClient } from './chrome/clients/pr-client';
import { SettingsClient } from './chrome/clients/settings-client';
import { SoundPreviewClient } from './chrome/clients/sound-preview-client';
import { DevTestClient } from './chrome/clients/dev-test-client';
import { RuntimeMessageClient } from './chrome/clients/runtime-message-client';

/**
 * Composition root for the cross-context Chrome-extension API surface. Popup, MV3 service worker,
 * and offscreen all use {@link chromeExtensionService} (lazy) or {@link getChromeExtensionService} —
 * every `chrome.*` reference is confined to `extension/common/chrome/**` (enforced by
 * `no-restricted-globals`).
 *
 * WHY [lazy singleton]: Adapters resolve the live `chrome` global at call time (see storage adapter
 * and other `make*Adapter` closures), so constructing this class in Node does not require
 * `globalThis.chrome` to exist until an API is actually invoked. Deferring `new ChromeExtensionService()`
 * avoids import-order coupling with Vitest and with tests that `vi.stubGlobal('chrome', …)`.
 *
 * ## Layers
 *
 * - **Layer A — raw namespace adapters** (`storage`, `runtime`, `alarms`, `notifications`, `tabs`,
 *   `action`, `permissions`, `offscreen`): promisified mirrors of the corresponding `chrome.*`
 *   APIs. Stateless factories returning typed objects.
 *
 * - **Layer B — popup-facing domain clients** (`prs`, `settings`, `sound`, `devTest`, `messages`):
 *   small classes that dispatch RPC actions to the background service worker or wrap chrome event
 *   slots into the cleanup-fn pattern preferred by React.
 */
export class ChromeExtensionService {
  /**
   * Public so callers outside this folder can gate their own logic without importing `chrome.*`.
   */
  isExtensionContext(): boolean {
    return isExtensionContext();
  }

  // ─── Layer A — raw chrome.* adapters ──────────────────────────────────────
  readonly storage = makeStorageAdapter();
  readonly runtime = makeRuntimeAdapter();
  readonly alarms = makeAlarmsAdapter();
  readonly notifications = makeNotificationsAdapter();
  readonly tabs = makeTabsAdapter();
  readonly action = makeActionAdapter();
  readonly permissions = makePermissionsAdapter();
  readonly offscreen = makeOffscreenAdapter();

  // ─── Layer B — popup-facing domain clients ─────────────────────────────────
  private readonly bg = new BackgroundActionClient(this.runtime);

  readonly prs = new PrClient(this.storage, this.bg);
  readonly settings = new SettingsClient(this.storage, this.bg);
  readonly sound = new SoundPreviewClient(this.bg);
  readonly devTest = new DevTestClient(this.bg);
  readonly messages = new RuntimeMessageClient(this.runtime);
}

let chromeExtensionServiceInstance: ChromeExtensionService | undefined;

/** Explicit access when you need the concrete instance (e.g. tests constructing a second service). */
export function getChromeExtensionService(): ChromeExtensionService {
  return (chromeExtensionServiceInstance ??= new ChromeExtensionService());
}

/**
 * Stable handle to the extension-wide service; underlying instance is created on first property read.
 * WHY [Proxy]: Preserves `import { chromeExtensionService }` ergonomics without running the
 * constructor at module load.
 */
export const chromeExtensionService = new Proxy({} as ChromeExtensionService, {
  get(_target, prop, receiver) {
    const inst = getChromeExtensionService();
    const value = Reflect.get(inst, prop, receiver);
    if (typeof value === 'function') {
      return (value as (...args: unknown[]) => unknown).bind(inst);
    }
    return value;
  },
});

// ─── Re-exports for back-compat callers ────────────────────────────────────
export { ExtensionContextType } from './chrome/chrome-globals';
export type {
  StorageChange,
  StorageAreaName,
  MessageSender,
  InstalledDetails,
  Alarm,
  AlarmCreateInfo,
  NotificationCreateOptions,
  NotificationPermissionLevel,
  ExtensionContext,
  ContextFilter,
  RuntimeManifest,
  OffscreenCreateParameters,
  OffscreenReason,
  BadgeColorDetails,
  BadgeTextDetails,
  TabDetails,
  PermissionsSpec,
  TabCreateProperties,
  Tab,
  StorageChangeListener,
  RuntimeMessageListener,
  InstalledListener,
  StartupListener,
  AlarmListener,
  NotificationClickedListener,
} from './chrome/chrome-types';
