import { useQuery } from '@tanstack/react-query';
import { chromeExtensionService } from '../services/chromeExtensionService';
import { queryKeys } from '../constants/queryKeys';

/**
 * Hook to get stored authored PRs with automatic background refresh.
 */
export function useAuthoredPRs() {
  return useQuery({
    queryKey: queryKeys.authoredPrs,
    queryFn: () => chromeExtensionService.getStoredAuthoredPRs(),
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

