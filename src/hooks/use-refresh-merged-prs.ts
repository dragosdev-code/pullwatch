import { useMutation, useQueryClient } from '@tanstack/react-query';
import { chromeExtensionService } from '@common/chrome-extension-service';
import { queryKeys } from '@src/constants/query-keys';

/**
 * Hook to manually refresh merged PRs (force fetch from GitHub).
 */
export const useRefreshMergedPRs = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => chromeExtensionService.prs.fetchFreshMerged(),
    onSuccess: (freshPRs) => {
      // Update the cached PR data immediately
      queryClient.setQueryData(queryKeys.mergedPrs, freshPRs);
    },
    onError: (error) => {
      console.error('Failed to refresh merged PRs:', error);
    },
  });
};
