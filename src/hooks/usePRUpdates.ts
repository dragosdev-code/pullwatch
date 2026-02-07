import { useQueryClient } from '@tanstack/react-query';
import { chromeExtensionService } from '../services/chromeExtensionService';
import type { PullRequest } from '../../extension/common/types';
import { queryKeys } from '../constants/queryKeys';

/**
 * Hook to listen for background script messages and update cache accordingly.
 */
export function usePRUpdates() {
  const queryClient = useQueryClient();

  return {
    setupListener: () => {
      return chromeExtensionService.onMessage((message) => {
        if (message.action === 'assignedPrDataUpdated') {
          const updatedPRs = message.data as PullRequest[];
          console.log('Received assigned PR data update from background, updating cache');

          // Update the cache with fresh data
          queryClient.setQueryData(queryKeys.assignedPrs, updatedPRs);
        } else if (message.action === 'mergedPrDataUpdated') {
          const updatedMerged = message.data as PullRequest[];
          console.log('Received merged PR data update from background, updating cache');
          queryClient.setQueryData(queryKeys.mergedPrs, updatedMerged);
        } else if (message.action === 'authoredPrDataUpdated') {
          const updatedAuthored = message.data as PullRequest[];
          console.log('Received authored PR data update from background, updating cache');
          queryClient.setQueryData(queryKeys.authoredPrs, updatedAuthored);
        }
      });
    },
  };
}
