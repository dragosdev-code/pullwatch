import { useEffect, useState } from 'react';
import {
  STORAGE_KEY_LAST_FETCH,
  STORAGE_KEY_PR_FETCH_IN_PROGRESS,
} from '../../extension/common/constants';
import { isExtensionContext } from '../utils/is-extension-context';

const HEADER_STORAGE_KEYS = [
  STORAGE_KEY_LAST_FETCH,
  STORAGE_KEY_PR_FETCH_IN_PROGRESS,
] as const;

export interface HeaderStorageSignals {
  lastFetchMs: number | null;
  backgroundFetchInProgress: boolean;
}

/**
 * Subscribes to `last_fetch_time` and `pr_fetch_in_progress` in chrome.storage.local.
 *
 * WHY storage listener: alarm-driven fetches do not run React Query mutations in the popup; the
 * background mirrors in-flight work to storage so the header can show “Updating…” without sendMessage.
 */
export const useHeaderStorageSignals = (): HeaderStorageSignals => {
  const [lastFetchMs, setLastFetchMs] = useState<number | null>(null);
  const [backgroundFetchInProgress, setBackgroundFetchInProgress] = useState(false);

  useEffect(() => {
    if (!isExtensionContext() || typeof chrome === 'undefined' || !chrome.storage?.local) {
      return;
    }

    let cancelled = false;

    const applySnapshot = (items: Record<string, unknown>): void => {
      if (cancelled) return;
      const ts = items[STORAGE_KEY_LAST_FETCH];
      setLastFetchMs(typeof ts === 'number' && Number.isFinite(ts) ? ts : null);
      const busy = items[STORAGE_KEY_PR_FETCH_IN_PROGRESS];
      setBackgroundFetchInProgress(busy === true);
    };

    chrome.storage.local.get([...HEADER_STORAGE_KEYS], (items) => {
      if (chrome.runtime?.lastError) {
        return;
      }
      applySnapshot(items as Record<string, unknown>);
    });

    const onStorageChanged = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ): void => {
      if (areaName !== 'local') return;

      if (STORAGE_KEY_LAST_FETCH in changes) {
        const nv = changes[STORAGE_KEY_LAST_FETCH].newValue;
        setLastFetchMs(typeof nv === 'number' && Number.isFinite(nv) ? nv : null);
      }
      if (STORAGE_KEY_PR_FETCH_IN_PROGRESS in changes) {
        setBackgroundFetchInProgress(changes[STORAGE_KEY_PR_FETCH_IN_PROGRESS].newValue === true);
      }
    };

    chrome.storage.onChanged.addListener(onStorageChanged);
    return () => {
      cancelled = true;
      chrome.storage.onChanged.removeListener(onStorageChanged);
    };
  }, []);

  return { lastFetchMs, backgroundFetchInProgress };
};
