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
 * Subscribes the popup to **local** PR list writes so the UI updates while the popup stays open.
 *
 * **Architectural gap this closes:** `usePRUpdates` listens for background `runtime` broadcasts
 * emitted only from `fetchFreshInBackground` (after `get*PRs` from the popup). The fetch **alarm**
 * updates storage via `PRService` but never sends those broadcasts, so an open popup would keep
 * stale cache until closed and reopened.
 *
 * **Why `chrome.storage.onChanged` instead of widening background messaging:** storage is the
 * single source of truth already used for first paint; any writer (now or future) triggers a sync
 * without coupling UI to every background code path.
 *
 * **Why `setQueryData` instead of `invalidateQueries`:** applying the persisted snapshot avoids an
 * extra `sendMessage` round-trip and does not schedule refetches that could fight with in-flight
 * queries; it matches hydration semantics.
 *
 * **Lifecycle:** the listener is removed on effect cleanup so popup teardown does not leak
 * listeners across open/close cycles (MV3 popups are ephemeral documents).
 */
export const usePrListsStorageSync = (): void => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isExtensionContext() || typeof chrome === 'undefined' || !chrome.storage?.onChanged) {
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
      changes: { [key: string]: chrome.storage.StorageChange },
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

    chrome.storage.onChanged.addListener(onStorageChanged);
    return () => {
      chrome.storage.onChanged.removeListener(onStorageChanged);
    };
  }, [queryClient]);
};
