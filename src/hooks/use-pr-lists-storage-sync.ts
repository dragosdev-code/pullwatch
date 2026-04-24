import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  STORAGE_KEY_ASSIGNED_PRS,
  STORAGE_KEY_AUTHORED_PRS,
  STORAGE_KEY_MERGED_PRS,
} from '../../extension/common/constants';
import type { PullRequest, StoredPRs } from '../../extension/common/types';
import { queryKeys } from '../constants/query-keys';
import { isExtensionContext } from '../utils/is-extension-context';
import {
  chromeExtensionService,
  type StorageChange,
} from '@common/chrome-extension-service';

/**
 * Each row ties a `chrome.storage.local` key (where the background `StorageService` persists PR lists)
 * to the matching TanStack Query cache key used by the popup hooks.
 *
 * WHY a single table: alarm-driven updates, install/startup seeding, and manual refresh all write
 * these keys; subscribing here covers every path without requiring the background to remember to
 * broadcast `runtime.sendMessage` (the periodic alarm path does not).
 */
const PR_LIST_STORAGE_SYNC_ROWS = [
  { storageKey: STORAGE_KEY_ASSIGNED_PRS, queryKey: queryKeys.assignedPrs },
  { storageKey: STORAGE_KEY_MERGED_PRS, queryKey: queryKeys.mergedPrs },
  { storageKey: STORAGE_KEY_AUTHORED_PRS, queryKey: queryKeys.authoredPrs },
] as const;

/**
 * Normalizes the value Chrome passes for a PR-list key into the array shape React Query expects.
 *
 * WHY tolerate unknown: corrupted or legacy storage should degrade to an empty list (same as
 * `hydratePrQueriesFromStorage`) rather than throwing inside a storage listener.
 */
const prListFromStorageValue = (value: unknown): PullRequest[] => {
  return (value as StoredPRs | undefined)?.prs ?? [];
};

/**
 * Keeps TanStack Query in sync with `chrome.storage.local` while the popup is open. The background
 * writes PR list envelopes on alarm ticks, install/startup fetch, and manual refresh; this listener
 * applies those snapshots with `setQueryData` (same semantics as hydrate — no sendMessage, no
 * invalidateQueries). Unsubscribes on unmount because the popup document is recreated each open.
 */
export const usePrListsStorageSync = (): void => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isExtensionContext()) {
      return;
    }

    /**
     * Chrome fires this for any `local` write. We only react to the three PR envelope keys so
     * unrelated keys (settings sync mirror, debug flags, custom sounds, etc.) never touch PR query
     * data or cause unnecessary React Query updates.
     *
     * @param changes - Map of key → `{ oldValue, newValue }` for keys that changed in this event.
     * @param areaName - `"local"` | `"sync"` | `"session"` — PR lists live in **local** only.
     */
    const onStorageChanged = (
      changes: { [key: string]: StorageChange },
      areaName: string,
    ): void => {
      if (areaName !== 'local') {
        return;
      }

      for (const row of PR_LIST_STORAGE_SYNC_ROWS) {
        if (!(row.storageKey in changes)) {
          continue;
        }
        const newValue = changes[row.storageKey].newValue;
        const prs = prListFromStorageValue(newValue);
        queryClient.setQueryData(row.queryKey, prs);
      }
    };

    chromeExtensionService.storage.onChanged.addListener(onStorageChanged);
    return () => {
      chromeExtensionService.storage.onChanged.removeListener(onStorageChanged);
    };
  }, [queryClient]);
};
