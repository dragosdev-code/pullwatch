import type { QueryClient } from '@tanstack/react-query';
import {
  STORAGE_KEY_ASSIGNED_PRS,
  STORAGE_KEY_AUTHORED_PRS,
  STORAGE_KEY_MERGED_PRS,
} from '../extension/common/constants';
import type { StoredPRs } from '../extension/common/types';
import { runWithTransientStorageRetry } from '../extension/common/transient-storage-retry';
import { queryKeys } from './constants/query-keys';
import { chromeExtensionService } from '@common/chrome-extension-service';
import { isExtensionContext } from './utils/is-extension-context';

/**
 * Prefills TanStack Query from chrome.storage.local before the first React paint. The background
 * is the writer for these keys; the popup never needs sendMessage to show the last persisted lists.
 * While the popup stays open, usePrListsStorageSync applies further writes via storage.onChanged.
 */
export const hydratePrQueriesFromStorage = async (
  queryClient: QueryClient
): Promise<void> => {
  if (!isExtensionContext()) {
    return;
  }

  const keys = [STORAGE_KEY_ASSIGNED_PRS, STORAGE_KEY_MERGED_PRS, STORAGE_KEY_AUTHORED_PRS] as const;

  let result: Record<string, unknown>;
  try {
    // Same retry policy as StorageService — see extension/common/transient-storage-retry.ts
    result = await runWithTransientStorageRetry(() =>
      chromeExtensionService.storage.local.get([...keys] as string[])
    );
  } catch {
    return;
  }

  const assigned = (result[STORAGE_KEY_ASSIGNED_PRS] as StoredPRs | undefined)?.prs ?? [];
  const merged = (result[STORAGE_KEY_MERGED_PRS] as StoredPRs | undefined)?.prs ?? [];
  const authored = (result[STORAGE_KEY_AUTHORED_PRS] as StoredPRs | undefined)?.prs ?? [];

  queryClient.setQueryData(queryKeys.assignedPrs, assigned);
  queryClient.setQueryData(queryKeys.mergedPrs, merged);
  queryClient.setQueryData(queryKeys.authoredPrs, authored);
};
