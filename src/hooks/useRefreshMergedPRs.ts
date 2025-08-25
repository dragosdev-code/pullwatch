import { useMutation, useQueryClient } from '@tanstack/react-query';
import { chromeExtensionService } from '../services/chromeExtensionService';
import { queryKeys } from '../constants/queryKeys';

/**
 * Hook to manually refresh merged PRs (force fetch from GitHub).
 */
export function useRefreshMergedPRs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => chromeExtensionService.fetchFreshMergedPRs(),
    onSuccess: (freshPRs) => {
      // Update the cached PR data immediately
      queryClient.setQueryData(queryKeys.mergedPrs, freshPRs);
    },
    onError: (error) => {
      console.error('Failed to refresh merged PRs:', error);
    },
  });
}
