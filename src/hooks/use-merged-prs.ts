import { useQuery } from '@tanstack/react-query';
import { chromeExtensionService } from '../services/chrome-extension-service';
import { queryKeys } from '../constants/query-keys';

/**
 * Hook to get stored merged PRs with automatic background refresh.
 */
export function useMergedPRs() {
  return useQuery({
    queryKey: queryKeys.mergedPrs,
    queryFn: () => chromeExtensionService.getStoredMergedPRs(),
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData, // Keep showing old data while fetching
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}
