const IS_DEVELOPMENT = true;

/**
 * Logs messages to the console only during development.
 * Supports multiple arguments, similar to console.log.
 * @param message - The primary message to log.
 * @param optionalParams - Additional parameters to log.
 */
export function debugLog(message?: unknown, ...optionalParams: unknown[]): void {
  if (IS_DEVELOPMENT) {
    console.log('[DEBUG]', message, ...optionalParams);
  }
}

/**
 * Logs warning messages to the console only during development.
 * @param message - The primary message to log.
 * @param optionalParams - Additional parameters to log.
 */
export function debugWarn(message?: unknown, ...optionalParams: unknown[]): void {
  console.warn('[DEBUG WARN]', message, ...optionalParams);
}

/**
 * Logs error messages to the console only during development.
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

// To make process.env.NODE_ENV available in Vite builds for web extension code,
// you typically need to use Vite's `define` option in vite.config.ts.
// For example:
// define: {
//   'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production')
// }
// This will replace process.env.NODE_ENV with its actual value at build time.
