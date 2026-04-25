import { makeListenerBinding, type ListenerBinding } from '../listener-binding';
import type {
  NotificationClickedListener,
  NotificationCreateOptions,
  NotificationPermissionLevel,
} from '../chrome-types';

export interface NotificationsAdapter {
  /** Create with an explicit notification id. */
  create(notificationId: string, options: NotificationCreateOptions): Promise<string>;
  /** Create with an auto-generated notification id. */
  create(options: NotificationCreateOptions): Promise<string>;

  clear(notificationId: string): Promise<boolean>;
  getAll(): Promise<Record<string, boolean>>;
  getPermissionLevel(): Promise<NotificationPermissionLevel>;
  readonly onClicked: ListenerBinding<NotificationClickedListener>;
}

function create(
  idOrOptions: string | NotificationCreateOptions,
  maybeOptions?: NotificationCreateOptions
): Promise<string> {
  if (typeof idOrOptions === 'string') {
    if (!maybeOptions) {
      return Promise.reject(
        new Error('chromeExtensionService.notifications.create: options required')
      );
    }
    return chrome.notifications.create(idOrOptions, maybeOptions);
  }
  return chrome.notifications.create(idOrOptions);
}

export function makeNotificationsAdapter(): NotificationsAdapter {
  return {
    create,
    clear: (id: string) => chrome.notifications.clear(id),
    getAll: () => chrome.notifications.getAll(),
    getPermissionLevel: () =>
      chrome.notifications.getPermissionLevel() as Promise<NotificationPermissionLevel>,
    onClicked: makeListenerBinding<NotificationClickedListener>(
      (l) => chrome.notifications.onClicked.addListener(l),
      (l) => chrome.notifications.onClicked.removeListener(l)
    ),
  };
}
