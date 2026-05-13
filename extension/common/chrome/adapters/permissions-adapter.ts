import { makeListenerBinding, type ListenerBinding } from '../listener-binding';
import type { PermissionsSpec } from '../chrome-types';

/**
 * Listener payload for `chrome.permissions.onAdded` / `onRemoved`. The chrome event hands back the
 * exact `Permissions` record that was added or removed — both `permissions` and `origins` may be
 * present, populated, or empty depending on what the user toggled.
 */
export type PermissionsChangeListener = (permissions: PermissionsSpec) => void;

export interface PermissionsAdapter {
  contains(permissions: PermissionsSpec): Promise<boolean>;
  request(permissions: PermissionsSpec): Promise<boolean>;
  /**
   * Fires when the user grants the extension new permissions (`request()` resolved true, OR the
   * user re-enabled site access in chrome://extensions). The `origins` field of the payload lists
   * which host patterns were re-granted.
   */
  readonly onAdded: ListenerBinding<PermissionsChangeListener>;
  /**
   * Fires when access is removed — including when the user flips the extension's site access from
   * "On all sites" to "On click" / "On specific sites" in chrome://extensions. The `origins` field
   * of the payload lists which host patterns lost their auto-grant.
   */
  readonly onRemoved: ListenerBinding<PermissionsChangeListener>;
}

export function makePermissionsAdapter(): PermissionsAdapter {
  return {
    contains: (p) => chrome.permissions.contains(p),
    request: (p) => chrome.permissions.request(p),
    onAdded: makeListenerBinding<PermissionsChangeListener>(
      (l) => chrome.permissions.onAdded.addListener(l),
      (l) => chrome.permissions.onAdded.removeListener(l)
    ),
    onRemoved: makeListenerBinding<PermissionsChangeListener>(
      (l) => chrome.permissions.onRemoved.addListener(l),
      (l) => chrome.permissions.onRemoved.removeListener(l)
    ),
  };
}
