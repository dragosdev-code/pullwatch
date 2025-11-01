import { useMutation, useQueryClient } from '@tanstack/react-query';
import { chromeExtensionService } from '../services/chromeExtensionService';
import { queryKeys } from '../constants/queryKeys';

/**
 * Hook to manually refresh authored PRs from GitHub.
 */
export function useRefreshAuthoredPRs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => chromeExtensionService.fetchFreshAuthoredPRs(),
    onSuccess: (data) => {
      // Update the cache with fresh data
      queryClient.setQueryData(queryKeys.authoredPrs, data);
    },
  });
}

