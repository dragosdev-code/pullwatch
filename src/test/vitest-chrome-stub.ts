import { vi } from 'vitest';

/**
 * `ChromeExtensionService` eagerly constructs storage adapters that read `chrome.storage.*` at init.
 * Extension service unit tests import that singleton transitively; Node has no `chrome` global unless
 * we provide a minimal stub before any `@common/chrome-extension-service` import is evaluated.
 */
function listenerBinding() {
  return {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  };
}

function storageArea() {
  return {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    getBytesInUse: vi.fn().mockResolvedValue(0),
  };
}

if (typeof (globalThis as { chrome?: typeof chrome }).chrome === 'undefined') {
  (globalThis as { chrome: typeof chrome }).chrome = {
    storage: {
      local: storageArea(),
      sync: storageArea(),
      session: storageArea(),
      onChanged: listenerBinding(),
    },
    runtime: {
      sendMessage: vi.fn().mockResolvedValue(undefined),
      getManifest: vi.fn(() => ({ manifest_version: 3, name: 'test', version: '0.0.0' })),
      getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
      getContexts: vi.fn().mockResolvedValue([]),
      onMessage: listenerBinding(),
      onInstalled: listenerBinding(),
      onStartup: listenerBinding(),
    },
    alarms: {
      create: vi.fn(),
      get: vi.fn(),
      getAll: vi.fn(),
      clear: vi.fn(),
      clearAll: vi.fn(),
      onAlarm: listenerBinding(),
    },
    notifications: {
      create: vi.fn(),
      clear: vi.fn(),
      getAll: vi.fn(),
      getPermissionLevel: vi.fn(),
      onClicked: listenerBinding(),
    },
    tabs: { create: vi.fn() },
    action: {
      setBadgeBackgroundColor: vi.fn(),
      setBadgeTextColor: vi.fn(),
      setBadgeText: vi.fn(),
      getBadgeText: vi.fn(),
    },
    permissions: {
      contains: vi.fn(),
      request: vi.fn(),
    },
  } as unknown as typeof chrome;
}
