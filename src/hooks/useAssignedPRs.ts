import { useQuery } from '@tanstack/react-query';
import { chromeExtensionService } from '../services/chromeExtensionService';
import { queryKeys } from '../constants/queryKeys';

/**
 * Hook to get stored assigned/review PRs with automatic background refresh.
 * Returns stored PRs immediately and fetches fresh data in background.
 */
export function useAssignedPRs() {
  return useQuery({
    queryKey: queryKeys.assignedPrs,
    queryFn: () => chromeExtensionService.getStoredAssignedPRs(),
    staleTime: 1000 * 30, // 30 seconds - data is fresh for this long
    gcTime: 1000 * 60 * 5, // 5 minutes - cache for this long when unused
    refetchOnMount: false, // Don't refetch when component mounts
    refetchOnWindowFocus: false, // Don't refetch on window focus for extensions
    placeholderData: (previousData) => previousData, // Keep showing old data while fetching
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}
