import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { PullRequest } from '../../../../../extension/common/types';
import { queryKeys } from '../../../../constants/query-keys';
import {
  hasDraftPRsInAssignedCache,
  useShowDraftsListHiddenHint,
} from '../hooks/use-show-drafts-list-hidden-hint';

const { readAssignedPrsFromLocalStorage } = vi.hoisted(() => ({
  readAssignedPrsFromLocalStorage: vi.fn(),
}));

vi.mock('../../../../services/chrome-extension-service', () => ({
  chromeExtensionService: {
    readAssignedPrsFromLocalStorage,
  },
}));

vi.mock('../../../../utils/is-extension-context', () => ({
  isExtensionContext: () => true,
}));

const draftPr = (): PullRequest => ({
  id: 'd1',
  url: 'https://github.com/o/r/pull/1',
  title: 'Draft',
  number: 1,
  repoName: 'o/r',
  author: [{ login: 'a' }],
  type: 'draft',
  reviewStatus: 'pending',
});

const openPr = (): PullRequest => ({
  id: 'o1',
  url: 'https://github.com/o/r/pull/2',
  title: 'Open',
  number: 2,
  repoName: 'o/r',
  author: [{ login: 'b' }],
  type: 'open',
  reviewStatus: 'pending',
});

describe('hasDraftPRsInAssignedCache', () => {
  it('is true when any PR has type draft', () => {
    expect(hasDraftPRsInAssignedCache([openPr(), draftPr()])).toBe(true);
  });

  it('is false when no drafts', () => {
    expect(hasDraftPRsInAssignedCache([openPr()])).toBe(false);
  });
});

describe('useShowDraftsListHiddenHint', () => {
  let queryClient: QueryClient;

  const createWrapper = () => {
    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    return Wrapper;
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    readAssignedPrsFromLocalStorage.mockResolvedValue([openPr()]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('does not show on mount when list setting is already off (no user transition)', async () => {
    readAssignedPrsFromLocalStorage.mockResolvedValue([draftPr()]);
    const { result } = renderHook(() => useShowDraftsListHiddenHint(false), {
      wrapper: createWrapper(),
    });
    await waitFor(() => {
      expect(result.current.hintVisible).toBe(false);
    });
  });

  it('shows after user turns setting off when cache still has drafts', async () => {
    readAssignedPrsFromLocalStorage.mockResolvedValue([draftPr()]);
    const { result, rerender } = renderHook(
      ({ showDraftsInList }) => useShowDraftsListHiddenHint(showDraftsInList),
      {
        wrapper: createWrapper(),
        initialProps: { showDraftsInList: true },
      },
    );
    await waitFor(() => {
      expect(readAssignedPrsFromLocalStorage).toHaveBeenCalled();
    });
    act(() => {
      rerender({ showDraftsInList: false });
    });
    expect(result.current.hintVisible).toBe(true);
  });

  it('hides when drafts are removed from cache (simulating sync/refresh)', async () => {
    readAssignedPrsFromLocalStorage.mockResolvedValue([draftPr()]);
    const { result, rerender } = renderHook(
      ({ showDraftsInList }) => useShowDraftsListHiddenHint(showDraftsInList),
      {
        wrapper: createWrapper(),
        initialProps: { showDraftsInList: true },
      },
    );
    await waitFor(() => {
      expect(readAssignedPrsFromLocalStorage).toHaveBeenCalled();
    });
    act(() => {
      rerender({ showDraftsInList: false });
    });
    expect(result.current.hintVisible).toBe(true);

    act(() => {
      queryClient.setQueryData(queryKeys.assignedPrs, [openPr()]);
    });
    await waitFor(() => {
      expect(result.current.hintVisible).toBe(false);
    });
  });

  it('hides immediately when user turns setting back on', async () => {
    readAssignedPrsFromLocalStorage.mockResolvedValue([draftPr()]);
    const { result, rerender } = renderHook(
      ({ showDraftsInList }) => useShowDraftsListHiddenHint(showDraftsInList),
      {
        wrapper: createWrapper(),
        initialProps: { showDraftsInList: true },
      },
    );
    await waitFor(() => {
      expect(readAssignedPrsFromLocalStorage).toHaveBeenCalled();
    });
    act(() => {
      rerender({ showDraftsInList: false });
    });
    expect(result.current.hintVisible).toBe(true);

    act(() => {
      rerender({ showDraftsInList: true });
    });
    expect(result.current.hintVisible).toBe(false);
  });
});
