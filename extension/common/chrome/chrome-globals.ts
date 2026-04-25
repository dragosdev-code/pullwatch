/**
 * Single point of contact with the `chrome` global. All other modules under `extension/common/chrome/`
 * import these helpers; only this file and the adapters directly mention `chrome.*`.
 */

/**
 * Returns the `chrome` global if it exists. jsdom/node tests may import the service before the
 * `chrome` namespace is stubbed, so callers must be prepared for `undefined`.
 */
export function getChrome(): typeof chrome | undefined {
  return typeof chrome !== 'undefined' ? chrome : undefined;
}

/**
 * Whether the current realm is a Chrome extension context with a usable `runtime.sendMessage`.
 * Public so callers outside this folder can gate logic without importing `chrome.*` directly.
 */
export function isExtensionContext(): boolean {
  const c = getChrome();
  return !!c && !!c.runtime && typeof c.runtime.sendMessage === 'function';
}

/** Whether `chrome.storage.local` is reachable in this realm. */
export function canReadLocalStorage(): boolean {
  return isExtensionContext() && typeof getChrome()?.storage?.local?.get === 'function';
}

/** Whether `chrome.storage.sync` is reachable in this realm. */
export function canReadSyncStorage(): boolean {
  return isExtensionContext() && typeof getChrome()?.storage?.sync?.get === 'function';
}

/**
 * `chrome.runtime.ContextType` enum value, with a structurally identical fallback for jsdom/node
 * runs that import this module before `globalThis.chrome` is stubbed. The real enum replaces the
 * fallback whenever the chrome global is available.
 */
export const ExtensionContextType: typeof chrome.runtime.ContextType =
  getChrome()?.runtime?.ContextType ??
  ({
    TAB: 'TAB',
    POPUP: 'POPUP',
    BACKGROUND: 'BACKGROUND',
    OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT',
    SIDE_PANEL: 'SIDE_PANEL',
    DEVELOPER_TOOLS: 'DEVELOPER_TOOLS',
  } as unknown as typeof chrome.runtime.ContextType);
