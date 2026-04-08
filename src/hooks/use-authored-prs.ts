import { useQuery } from '@tanstack/react-query';
import type { PullRequest } from '../../extension/common/types';
import { queryKeys } from '../constants/query-keys';
import { chromeExtensionService } from '../services/chrome-extension-service';
import { isExtensionContext } from '../utils/is-extension-context';
import authoredPRsMock from '../mocks/authored-prs.json';

/**
 * Authored PR list — same data flow as useAssignedPRs: hydrate, storage read, then storage.onChanged.
 */
export const useAuthoredPRs = () => {
  return useQuery({
    queryKey: queryKeys.authoredPrs,
    queryFn: () =>
      isExtensionContext()
        ? chromeExtensionService.readAuthoredPrsFromLocalStorage()
        : Promise.resolve(authoredPRsMock as PullRequest[]),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 1000 * 60 * 5,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
};
