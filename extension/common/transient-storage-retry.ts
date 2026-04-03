import { isTransientExtensionStorageError } from './errors';

/**
 * Retries chrome.storage operations when Chromium rejects them while the MV3 host
 * is still waking — see {@link isTransientExtensionStorageError} in errors.ts for
 * why detection is message-based rather than `instanceof` a shared class.
 */

const RETRY_DELAYS_MS = [0, 50, 150] as const;
const MAX_TRIES = RETRY_DELAYS_MS.length;

/**
 * Runs `operation` up to MAX_TRIES times. Retries only on {@link isTransientExtensionStorageError};
 * any other rejection is rethrown immediately from the first failure.
 */
export async function runWithTransientStorageRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientExtensionStorageError(error) || attempt === MAX_TRIES - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
  throw lastError;
}
