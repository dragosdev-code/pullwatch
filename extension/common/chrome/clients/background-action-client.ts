import type { RequestRuntimeAction } from '../../runtime-actions';
import type { RuntimeAdapter } from '../adapters/runtime-adapter';
import { isExtensionContext } from '../chrome-globals';

interface ActionResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Dispatches `{ action, payload }` envelopes to the background service worker and unwraps the
 * `{ success, data, error }` response. Layer B clients depend on this client; tests can fake it
 * with a single `dispatch` stub instead of mocking `chrome.runtime`.
 */
export class BackgroundActionClient {
  constructor(private readonly runtime: RuntimeAdapter) {}

  async dispatch<T>(action: RequestRuntimeAction, payload?: unknown): Promise<T> {
    if (!isExtensionContext()) {
      throw new Error('Extension context not available');
    }
    const response = await this.runtime.sendMessage<ActionResponse<T>>({ action, payload });
    if (response?.success) return response.data as T;
    throw new Error(response?.error || `Failed to execute action: ${action}`);
  }
}
