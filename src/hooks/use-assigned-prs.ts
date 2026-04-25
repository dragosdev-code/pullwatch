import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import type { PullRequest } from '@common/types';
import { queryKeys } from '@src/constants/query-keys';
import { chromeExtensionService } from '@common/chrome-extension-service';
import { isExtensionContext } from '@src/utils/is-extension-context';
import assignedPRsMock from '@src/mocks/assigned-prs.json';

type AssignedPrsQueryKey = typeof queryKeys.assignedPrs;

/**
 * Shared options for the assigned PRs query so Settings (and any consumer) can attach `select`
 * without duplicating `queryFn`, extension vs mock behavior, or timing.
 *
 * In the extension, the cache is filled by: (1) hydratePrQueriesFromStorage before React mounts,
 * (2) this queryFn via chromeExtensionService.readAssignedPrsFromLocalStorage, (3) usePrListsStorageSync while the popup is open
 * when the background writes list keys. Fresh GitHub data only enters via the service worker
 * (alarm or manual fetch*). staleTime is infinite because invalidation is storage-driven, not TTL-based.
 */
export const assignedPrsQueryOptions: Omit<
  UseQueryOptions<PullRequest[], Error, PullRequest[], AssignedPrsQueryKey>,
  'select'
> = {
  queryKey: queryKeys.assignedPrs,
  queryFn: () =>
    isExtensionContext()
      ? chromeExtensionService.readAssignedPrsFromLocalStorage()
      : Promise.resolve(assignedPRsMock as PullRequest[]),
  staleTime: Number.POSITIVE_INFINITY,
  gcTime: 1000 * 60 * 5,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  placeholderData: (previousData) => previousData,
  retry: 3,
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
};

/**
 * Assigned / review-requested PRs for the popup. Uses mock data outside the extension build.
 */
export const useAssignedPRs = () => {
  return useQuery(assignedPrsQueryOptions);
};
