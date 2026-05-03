// WHY: Always emit to console (including production builds). Unpacked installs and MV3
// service-worker/offscreen logs are the main support surface; gating on DEV hid signal there.

/**
 * Logs messages to the console. Supports multiple arguments, similar to console.log.
 * @param message - The primary message to log.
 * @param optionalParams - Additional parameters to log.
 */
export function debugLog(message?: unknown, ...optionalParams: unknown[]): void {
  console.log('[DEBUG]', message, ...optionalParams);
}

/**
 * Logs warning messages to the console.
 * @param message - The primary message to log.
 * @param optionalParams - Additional parameters to log.
 */
export function debugWarn(message?: unknown, ...optionalParams: unknown[]): void {
  console.warn('[DEBUG WARN]', message, ...optionalParams);
}

/**
 * Logs error messages to the console.
 * Also includes the stack trace if the message is an error object.
 * @param message - The primary message or error object to log.
 * @param optionalParams - Additional parameters to log.
 */
export function debugError(message?: unknown, ...optionalParams: unknown[]): void {
  if (message instanceof Error) {
    console.error('[DEBUG ERROR]', message.message, ...optionalParams, '\nStack:', message.stack);
  } else {
    console.error('[DEBUG ERROR]', message, ...optionalParams);
  }
}

/**
 * Placeholder for a function to initialize more complex debugging tools if needed.
 */
export function initializeDebugTools(): void {
  debugLog('Debugging tools initialized.');
  // Example: integrate with a more sophisticated logging library
  // or set up specific debug flags in the window object for the popup/offscreen pages
}
