import { useMutation, useQueryClient } from '@tanstack/react-query';
import { chromeExtensionService } from '../services/chromeExtensionService';
import { queryKeys } from '../constants/queryKeys';

/**
 * Hook to manually refresh assigned/review PRs (force fetch from GitHub).
 */
export function useRefreshAssignedPRs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => chromeExtensionService.fetchFreshAssignedPRs(),
    onSuccess: (freshPRs) => {
      // Update the cached PR data immediately
      queryClient.setQueryData(queryKeys.assignedPrs, freshPRs);
    },
    onError: (error) => {
      console.error('Failed to refresh assigned PRs:', error);
    },
  });
}
