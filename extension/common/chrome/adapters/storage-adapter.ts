import { getChrome } from '../chrome-globals';
import { makeListenerBinding, type ListenerBinding } from '../listener-binding';
import type { StorageChangeListener } from '../chrome-types';

type StorageKeys = string | string[] | Record<string, unknown> | null | undefined;

interface StorageAreaAdapter {
  get(keys?: StorageKeys): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  clear(): Promise<void>;
}

interface LocalStorageAreaAdapter extends StorageAreaAdapter {
  getBytesInUse(keys?: string | string[] | null): Promise<number>;
}

export interface StorageAdapter {
  readonly local: LocalStorageAreaAdapter;
  readonly sync: StorageAreaAdapter;
  readonly session: StorageAreaAdapter;
  readonly onChanged: ListenerBinding<StorageChangeListener>;
}

function storage() {
  const api = getChrome()?.storage;
  if (!api) {
    throw new Error('chrome.storage is not available');
  }
  return api;
}

/** Resolves the live `chrome.storage.*` area on each call so tests can replace `globalThis.chrome`. */
function makeAreaAdapter(getArea: () => chrome.storage.StorageArea): StorageAreaAdapter {
  return {
    get: (keys) => getArea().get(keys ?? null) as Promise<Record<string, unknown>>,
    set: (items) => getArea().set(items),
    remove: (keys) => getArea().remove(keys),
    clear: () => getArea().clear(),
  };
}

export function makeStorageAdapter(): StorageAdapter {
  const local: LocalStorageAreaAdapter = {
    ...makeAreaAdapter(() => storage().local),
    getBytesInUse: (keys) => storage().local.getBytesInUse(keys ?? null),
  };

  return {
    local,
    sync: makeAreaAdapter(() => storage().sync),
    session: makeAreaAdapter(() => storage().session),
    onChanged: makeListenerBinding<StorageChangeListener>(
      (l) => storage().onChanged.addListener(l),
      (l) => storage().onChanged.removeListener(l)
    ),
  };
}
