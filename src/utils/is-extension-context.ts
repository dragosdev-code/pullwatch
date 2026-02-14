/**
 * Checks if we're running in a Chrome extension context.
 * Used to fall back to mock data when developing outside the extension.
 */
export function isExtensionContext(): boolean {
  return (
    typeof chrome !== 'undefined' &&
    !!chrome?.runtime &&
    typeof chrome.runtime.sendMessage === 'function'
  );
}
