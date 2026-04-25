/**
 * Helpers for the duplicated `addListener` / `removeListener` pattern that every chrome event slot
 * exposes. Adapters use {@link makeListenerBinding} to wrap a register/unregister pair into the
 * shape the rest of the codebase expects; popup-facing clients use {@link subscribeWithCleanup}
 * to convert that binding into the React-friendly cleanup-fn pattern.
 */

export interface ListenerBinding<L> {
  addListener(listener: L): void;
  removeListener(listener: L): void;
}

/**
 * Wraps a register/unregister function pair into the `{ addListener, removeListener }` shape that
 * adapters expose for each chrome event slot — keeps each adapter file's event sections one line.
 */
export function makeListenerBinding<L>(
  add: (listener: L) => void,
  remove: (listener: L) => void
): ListenerBinding<L> {
  return { addListener: add, removeListener: remove };
}

/**
 * React-friendly subscription helper: registers `listener` on `binding` and returns a cleanup fn
 * that removes it. If `gate()` returns false, returns a no-op cleanup without registering — this
 * preserves the "popup outside extension context = no-op" semantics that the original
 * `onMessage` / `onSettingsChange` methods had.
 */
export function subscribeWithCleanup<L>(
  binding: ListenerBinding<L>,
  listener: L,
  gate: () => boolean = () => true
): () => void {
  if (!gate()) return () => {};
  binding.addListener(listener);
  return () => binding.removeListener(listener);
}
