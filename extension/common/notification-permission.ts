/**
 * WHY [module boundary]: Isolates the only Chromium-specific notification permission API so a future
 * Safari/WebKit port can swap this single file without touching NotificationService or the popup.
 * Safari Web Extensions use a different notifications API surface (`browser.notifications` with
 * distinct permission semantics) — confining the check here keeps that diff minimal.
 *
 * WHY [Chrome vs OS]: `getPermissionLevel` reflects whether *Chrome* has blocked this extension's
 * notifications (user toggled it off in chrome://settings/content/notifications or Chrome policy).
 * It does NOT detect OS-level suppression (Windows Focus Assist, macOS DND, per-app notification
 * toggles in System Settings). When this returns `'granted'`, the toast may still be silently
 * swallowed by the OS — there is no extension API to detect that case.
 */

/** Chrome's coarse permission level for this extension's chrome.notifications API. */
export type ChromeNotificationPermissionLevel = 'granted' | 'denied';

/**
 * Queries Chrome's per-extension notification display permission.
 *
 * WHY [not cached]: The user can toggle this in Chrome settings at any time between Preview clicks.
 * Always re-query so the notice reflects the *current* state when the user clicks Preview.
 */
export const getChromeNotificationPermissionLevel =
  async (): Promise<ChromeNotificationPermissionLevel> => {
    // WHY [Promise API]: Chrome 116+ supports the Promise return; callback form is still available
    // but unnecessary for our minimum Chrome target. The cast narrows the Chrome-typed union.
    const level = await chrome.notifications.getPermissionLevel();
    return level as ChromeNotificationPermissionLevel;
  };
