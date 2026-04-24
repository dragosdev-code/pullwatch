import { useCallback, useEffect, useRef, useState } from 'react';
import { isExtensionContext } from '../utils/is-extension-context';
import {
  chromeExtensionService,
  type StorageChange,
} from '@common/chrome-extension-service';

interface UseSyncedStorageValueOptions<T extends string> {
  key: string;
  defaultValue: T;
  /** Coerce a raw storage value (null/undefined/unknown shape) into a valid T. */
  validate: (raw: unknown) => T;
  /** Optional side effect on load, storage change, and set. Useful for DOM sync (CSS vars, etc.). */
  onApply?: (value: T) => void;
}

/**
 * State backed by both chrome.storage.sync (cross-instance + cross-device persistence) and
 * localStorage (synchronous fallback in non-extension contexts and for anti-flicker init scripts).
 * chrome.storage.onChanged keeps concurrent popup instances in sync.
 */
export const useSyncedStorageValue = <T extends string>({
  key,
  defaultValue,
  validate,
  onApply,
}: UseSyncedStorageValueOptions<T>): readonly [T, (next: T) => Promise<void>] => {
  const [value, setValueState] = useState<T>(defaultValue);

  // Captured in refs so storage listeners never re-subscribe when callers pass inline closures.
  const validateRef = useRef(validate);
  const onApplyRef = useRef(onApply);
  validateRef.current = validate;
  onApplyRef.current = onApply;

  useEffect(() => {
    const load = async () => {
      try {
        let raw: unknown;

        if (isExtensionContext()) {
          const result = await chromeExtensionService.storage.sync.get(key);
          raw = result[key];
        }

        if (raw === undefined || raw === null) {
          raw = localStorage.getItem(key);
        }

        const validated = validateRef.current(raw);
        setValueState(validated);
        onApplyRef.current?.(validated);
      } catch {
        setValueState(defaultValue);
        onApplyRef.current?.(defaultValue);
      }
    };

    load();

    if (!isExtensionContext()) return;

    const onStorageChanged = (
      changes: { [k: string]: StorageChange },
      area: string
    ) => {
      if (area !== 'sync' || !changes[key]) return;
      const validated = validateRef.current(changes[key].newValue);
      setValueState(validated);
      onApplyRef.current?.(validated);
    };

    chromeExtensionService.storage.onChanged.addListener(onStorageChanged);
    return () => chromeExtensionService.storage.onChanged.removeListener(onStorageChanged);
  }, [key, defaultValue]);

  const setValue = useCallback(
    async (next: T) => {
      setValueState(next);
      onApplyRef.current?.(next);
      try {
        localStorage.setItem(key, next);
      } catch {
        // localStorage can throw in private mode / over quota; sync path below still runs.
      }
      try {
        if (isExtensionContext()) {
          await chromeExtensionService.storage.sync.set({ [key]: next });
        }
      } catch {
        console.warn(`Failed to persist ${key} to Chrome storage`);
      }
    },
    [key]
  );

  return [value, setValue] as const;
};
