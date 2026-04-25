import type { RuntimeMessage } from '../../types';
import type { RuntimeAdapter } from '../adapters/runtime-adapter';
import type { RuntimeMessageListener } from '../chrome-types';
import { isExtensionContext } from '../chrome-globals';
import { subscribeWithCleanup } from '../listener-binding';

/**
 * Subscription helper for background-script broadcast messages, exposing the
 * cleanup-fn pattern that React `useEffect` expects.
 */
export class RuntimeMessageClient {
  constructor(private readonly runtime: RuntimeAdapter) {}

  /** Registers `callback` for runtime messages and returns a cleanup fn. */
  subscribe(callback: (message: RuntimeMessage) => void): () => void {
    const listener: RuntimeMessageListener = (message) => {
      callback(message as RuntimeMessage);
    };
    return subscribeWithCleanup(this.runtime.onMessage, listener, isExtensionContext);
  }
}
