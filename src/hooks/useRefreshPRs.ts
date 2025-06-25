import { useMutation, useQueryClient } from '@tanstack/react-query';
import { chromeExtensionService } from '../services/chromeExtensionService';
import { queryKeys } from '../constants/queryKeys';

/**
 * Hook to manually refresh PRs (force fetch from GitHub).
 */
export function useRefreshPRs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => chromeExtensionService.fetchFreshPRs(),
    onSuccess: (freshPRs) => {
      // Update the cached PR data immediately
      queryClient.setQueryData(queryKeys.prs, freshPRs);
    },
    onError: (error) => {
      console.error('Failed to refresh PRs:', error);
    },
  });
}
