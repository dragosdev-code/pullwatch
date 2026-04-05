/**
 * Packaged static assets (paths are relative to the extension root / manifest).
 * After changing public/logo.png, run `npm run icons` so derived sizes stay in sync.
 *
 * Chrome notifications accept extension package URLs; 128×128 is the usual size.
 */
export const NOTIFICATION_ICON_FILE = 'logo-128.png' as const;

export function getNotificationIconUrl(): string {
  return chrome.runtime.getURL(NOTIFICATION_ICON_FILE);
}
