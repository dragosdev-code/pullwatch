import type { QueryClient } from '@tanstack/react-query';
import {
  STORAGE_KEY_ASSIGNED_PRS,
  STORAGE_KEY_AUTHORED_PRS,
  STORAGE_KEY_MERGED_PRS,
} from '../extension/common/constants';
import type { StoredPRs } from '../extension/common/types';
import { queryKeys } from './constants/query-keys';
import { isExtensionContext } from './utils/is-extension-context';

/**
 * Prefills React Query from chrome.storage.local so the popup first paint matches
 * cached PR lists without waiting on the service worker + sendMessage.
 */
export async function hydratePrQueriesFromStorage(queryClient: QueryClient): Promise<void> {
  if (!isExtensionContext() || typeof chrome === 'undefined' || !chrome.storage?.local) {
    return;
  }

  const keys = [STORAGE_KEY_ASSIGNED_PRS, STORAGE_KEY_MERGED_PRS, STORAGE_KEY_AUTHORED_PRS] as const;
  const result = await chrome.storage.local.get([...keys]);

  const assigned = (result[STORAGE_KEY_ASSIGNED_PRS] as StoredPRs | undefined)?.prs ?? [];
  const merged = (result[STORAGE_KEY_MERGED_PRS] as StoredPRs | undefined)?.prs ?? [];
  const authored = (result[STORAGE_KEY_AUTHORED_PRS] as StoredPRs | undefined)?.prs ?? [];

  queryClient.setQueryData(queryKeys.assignedPrs, assigned);
  queryClient.setQueryData(queryKeys.mergedPrs, merged);
  queryClient.setQueryData(queryKeys.authoredPrs, authored);
}
