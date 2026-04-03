import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import type { PullRequest } from '../../extension/common/types';
import { chromeExtensionService } from '../services/chrome-extension-service';
import { queryKeys } from '../constants/query-keys';
import { isExtensionContext } from '../utils/is-extension-context';
import assignedPRsMock from '../mocks/assigned-prs.json';

type AssignedPrsQueryKey = typeof queryKeys.assignedPrs;

/**
 * Shared options for the assigned PRs query so Settings (and any consumer) can attach `select`
 * without duplicating `queryFn`, extension vs mock behavior, or timing.
 */
export const assignedPrsQueryOptions: Omit<
  UseQueryOptions<PullRequest[], Error, PullRequest[], AssignedPrsQueryKey>,
  'select'
> = {
  queryKey: queryKeys.assignedPrs,
  queryFn: () =>
    isExtensionContext()
      ? chromeExtensionService.getStoredAssignedPRs()
      : Promise.resolve(assignedPRsMock as PullRequest[]),
  staleTime: 1000 * 30, // 30 seconds - data is fresh for this long
  gcTime: 1000 * 60 * 5, // 5 minutes - cache for this long when unused
  refetchOnMount: 'always',
  refetchOnWindowFocus: false, // Don't refetch on window focus for extensions
  placeholderData: (previousData) => previousData, // Keep showing old data while fetching
  retry: 3,
  retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
};

/**
 * Hook to get stored assigned/review PRs with automatic background refresh.
 * Returns stored PRs immediately and fetches fresh data in background.
 * Uses mock data when not running in browser extension context.
 */
export const useAssignedPRs = () => {
  return useQuery(assignedPrsQueryOptions);
};
