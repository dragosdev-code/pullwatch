import { useQuery } from '@tanstack/react-query';
import type { PullRequest } from '../../extension/common/types';
import { chromeExtensionService } from '../services/chrome-extension-service';
import { queryKeys } from '../constants/query-keys';
import { isExtensionContext } from '../utils/is-extension-context';
import mergedPRsMock from '../mocks/merged-prs.json';

/**
 * Hook to get stored merged PRs with automatic background refresh.
 * Uses mock data when not running in browser extension context.
 */
export function useMergedPRs() {
  return useQuery({
    queryKey: queryKeys.mergedPrs,
    queryFn: () =>
      isExtensionContext()
        ? chromeExtensionService.getStoredMergedPRs()
        : Promise.resolve(mergedPRsMock as PullRequest[]),
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData, // Keep showing old data while fetching
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}
