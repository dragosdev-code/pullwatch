import { makeListenerBinding, type ListenerBinding } from '../listener-binding';
import type {
  ContextFilter,
  ExtensionContext,
  InstalledListener,
  RuntimeManifest,
  RuntimeMessageListener,
  StartupListener,
} from '../chrome-types';

export interface RuntimeAdapter {
  sendMessage<T = unknown>(message: unknown): Promise<T>;
  getManifest(): RuntimeManifest;
  getURL(path: string): string;
  /** Current extension's runtime id; used to filter out cross-extension senders. */
  getExtensionId(): string;
  getContexts(filter: ContextFilter): Promise<ExtensionContext[]>;
  hasGetContexts(): boolean;
  readonly onMessage: ListenerBinding<RuntimeMessageListener>;
  readonly onInstalled: ListenerBinding<InstalledListener>;
  readonly onStartup: ListenerBinding<StartupListener>;
}

type ChromeMessageListener = Parameters<typeof chrome.runtime.onMessage.addListener>[0];

export function makeRuntimeAdapter(): RuntimeAdapter {
  return {
    sendMessage: <T = unknown>(message: unknown) =>
      chrome.runtime.sendMessage(message) as Promise<T>,
    getManifest: () => chrome.runtime.getManifest(),
    getURL: (path) => chrome.runtime.getURL(path),
    getExtensionId: () => chrome.runtime.id,
    getContexts: (filter) => chrome.runtime.getContexts(filter),
    hasGetContexts: () => typeof chrome.runtime?.getContexts === 'function',
    onMessage: makeListenerBinding<RuntimeMessageListener>(
      (l) => chrome.runtime.onMessage.addListener(l as ChromeMessageListener),
      (l) => chrome.runtime.onMessage.removeListener(l as ChromeMessageListener)
    ),
    onInstalled: makeListenerBinding<InstalledListener>(
      (l) => chrome.runtime.onInstalled.addListener(l),
      (l) => chrome.runtime.onInstalled.removeListener(l)
    ),
    onStartup: makeListenerBinding<StartupListener>(
      (l) => chrome.runtime.onStartup.addListener(l),
      (l) => chrome.runtime.onStartup.removeListener(l)
    ),
  };
}
