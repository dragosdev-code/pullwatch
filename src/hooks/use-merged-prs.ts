import { useQuery } from '@tanstack/react-query';
import type { PullRequest } from '../../extension/common/types';
import { queryKeys } from '../constants/query-keys';
import { chromeExtensionService } from '../services/chrome-extension-service';
import { isExtensionContext } from '../utils/is-extension-context';
import mergedPRsMock from '../mocks/merged-prs.json';

/**
 * Merged PR list — same data flow as useAssignedPRs: hydrate, storage read, then storage.onChanged.
 */
export const useMergedPRs = () => {
  return useQuery({
    queryKey: queryKeys.mergedPrs,
    queryFn: () =>
      isExtensionContext()
        ? chromeExtensionService.readMergedPrsFromLocalStorage()
        : Promise.resolve(mergedPRsMock as PullRequest[]),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 1000 * 60 * 5,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
};
