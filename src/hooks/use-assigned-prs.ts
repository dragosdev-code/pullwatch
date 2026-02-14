import { useQuery } from '@tanstack/react-query';
import type { PullRequest } from '../../extension/common/types';
import { chromeExtensionService } from '../services/chrome-extension-service';
import { queryKeys } from '../constants/query-keys';
import { isExtensionContext } from '../utils/is-extension-context';
import assignedPRsMock from '../mocks/assigned-prs.json';

/**
 * Hook to get stored assigned/review PRs with automatic background refresh.
 * Returns stored PRs immediately and fetches fresh data in background.
 * Uses mock data when not running in browser extension context.
 */
export function useAssignedPRs() {
  return useQuery({
    queryKey: queryKeys.assignedPrs,
    queryFn: () =>
      isExtensionContext()
        ? chromeExtensionService.getStoredAssignedPRs()
        : Promise.resolve(assignedPRsMock as PullRequest[]),
    staleTime: 1000 * 30, // 30 seconds - data is fresh for this long
    gcTime: 1000 * 60 * 5, // 5 minutes - cache for this long when unused
    refetchOnMount: false, // Don't refetch when component mounts
    refetchOnWindowFocus: false, // Don't refetch on window focus for extensions
    placeholderData: (previousData) => previousData, // Keep showing old data while fetching
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}
