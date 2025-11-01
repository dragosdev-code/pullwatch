import { useMutation, useQueryClient } from '@tanstack/react-query';
import { chromeExtensionService } from '../services/chromeExtensionService';
import { queryKeys } from '../constants/queryKeys';

/**
 * Hook to manually refresh authored PRs from GitHub (force fetch).
 */
export function useRefreshAuthoredPRs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => chromeExtensionService.fetchFreshAuthoredPRs(),
    onSuccess: (freshPRs) => {
      // Update the cached PR data immediately
      queryClient.setQueryData(queryKeys.authoredPrs, freshPRs);
    },
    onError: (error) => {
      console.error('Failed to refresh authored PRs:', error);
    },
  });
}

