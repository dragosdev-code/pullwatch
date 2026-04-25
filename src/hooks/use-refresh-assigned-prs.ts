import { useMutation, useQueryClient } from '@tanstack/react-query';
import { chromeExtensionService } from '@common/chrome-extension-service';
import { queryKeys } from '@src/constants/query-keys';

/**
 * Hook to manually refresh assigned/review PRs (force fetch from GitHub).
 */
export const useRefreshAssignedPRs = () => {
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
};
